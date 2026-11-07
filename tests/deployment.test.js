import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cloudinary from "../src/utils/cloud.js";
import { generateToken, verifyToken } from "../src/utils/token.js";
import { createLessonUpload, resolveLessonUpload, prepareLessonMedia, assertLessonUploadsUnused } from "../src/modules/lesson/lesson-upload.utils.js";
import { lessonUploadSchema } from "../src/modules/lesson/lesson.validation.js";
import { runJob } from "../src/modules/jobs/jobs.controller.js";
import { signLessonUpload, createLesson } from "../src/modules/lesson/lesson.controller.js";
import { prisma } from "../db/index.js";

test("direct uploads bind tickets to the teacher, course, type and provider metadata", async () => {
  const originalSecret = process.env.SECRET_KEY;
  const originalApiSecret = process.env.API_SECRET;
  const originalResource = cloudinary.api.resource;
  process.env.SECRET_KEY = "deployment-test-secret";
  process.env.API_SECRET = "deployment-test-provider-secret";
  try {
    const scope = { teacherId: "teacher-one", courseId: "course-one", kind: "video" };
    const ticket = createLessonUpload({ ...scope, name: "Lesson.mp4" });
    assert.equal(ticket.fields.type, "authenticated");
    assert.equal(ticket.fields.overwrite, false);
    assert.equal(ticket.fields.api_secret, undefined);
    const { api_key, signature, ...params } = ticket.fields;
    assert.equal(signature, cloudinary.utils.api_sign_request(params, process.env.API_SECRET));
    assert.equal(verifyToken(ticket.uploadToken).tokenType, "lesson_upload");
    let calls = 0;
    const resource = { public_id: ticket.fields.public_id, resource_type: "video", type: "authenticated", bytes: 100, format: "mp4", duration: 20 };
    cloudinary.api.resource = async (publicId, options) => {
      calls++;
      assert.equal(publicId, resource.public_id);
      assert.equal(options.type, "authenticated");
      return resource;
    };
    for (const changes of [{ teacherId: "another" }, { courseId: "another" }, { kind: "attachment" }]) {
      await assert.rejects(resolveLessonUpload(ticket.uploadToken, { ...scope, ...changes }), (error) => error.statusCode === 400);
    }
    await assert.rejects(resolveLessonUpload(`${ticket.uploadToken}tampered`, scope));
    const expired = generateToken({ payload: { ...scope, tokenType: "lesson_upload", publicId: resource.public_id }, expiresIn: -1 });
    await assert.rejects(resolveLessonUpload(expired, scope));
    assert.equal(calls, 0);
    assert.deepEqual(await resolveLessonUpload(ticket.uploadToken, scope), { publicId: resource.public_id, format: "mp4", duration: 20 });
    resource.bytes = 257 * 1024 * 1024;
    await assert.rejects(resolveLessonUpload(ticket.uploadToken, scope), (error) => error.statusCode === 400);
    resource.bytes = 100;
    resource.type = "upload";
    await assert.rejects(resolveLessonUpload(ticket.uploadToken, scope), (error) => error.statusCode === 400);
    cloudinary.api.resource = async () => { throw { http_code: 404 }; };
    await assert.rejects(resolveLessonUpload(ticket.uploadToken, scope), (error) => error.statusCode === 400);
  } finally {
    cloudinary.api.resource = originalResource;
    if (originalSecret === undefined) delete process.env.SECRET_KEY; else process.env.SECRET_KEY = originalSecret;
    if (originalApiSecret === undefined) delete process.env.API_SECRET; else process.env.API_SECRET = originalApiSecret;
  }
});

test("upload input rejects unsafe names, unsupported types and mixed or excessive files", async () => {
  assert.equal(lessonUploadSchema.validate({ kind: "video", name: "Lesson.mp4" }).error, undefined);
  assert.equal(lessonUploadSchema.validate({ kind: "attachment", name: "Notes.pdf" }).error, undefined);
  for (const value of [{ kind: "video", name: "Notes.pdf" }, { kind: "attachment", name: "Lesson.mp4" }, { kind: "video", name: "../Lesson.mp4" }, { kind: "attachment", name: "script.exe" }]) {
    assert.ok(lessonUploadSchema.validate(value).error);
  }
  await assert.rejects(prepareLessonMedia({ video: [{}] }, { videoUploadToken: "ticket" }, {}));
  await assert.rejects(prepareLessonMedia({ attachments: [{}] }, { attachmentUploadTokens: Array(10).fill("ticket") }, {}));
});

test("asset reuse checks run under database locks and reject attached or detached files", async () => {
  const media = { directAssets: [{ publicId: "asset" }] };
  const order = [];
  let attached = null;
  let deleting = null;
  const transaction = {
    $queryRaw: async () => order.push("lock"),
    lesson: { findFirst: async () => { order.push("lookup"); return attached; } },
    mediaCleanupTask: { findFirst: async () => deleting },
  };
  await assertLessonUploadsUnused(media, transaction);
  assert.deepEqual(order, ["lock", "lookup"]);
  attached = { id: "lesson" };
  await assert.rejects(assertLessonUploadsUnused(media, transaction));
  attached = null;
  deleting = { id: "cleanup" };
  await assert.rejects(assertLessonUploadsUnused(media, transaction));
});

test("scheduler requires its own secret and rejects missing, invalid and user access tokens", async () => {
  const previous = process.env.CRON_SECRET;
  const request = (authorization) => ({ headers: { authorization }, validatedParams: { task: "security" } });
  const next = (error) => { throw error; };
  try {
    delete process.env.CRON_SECRET;
    await assert.rejects(runJob(request("Bearer undefined"), {}, next), (error) => error.statusCode === 401);
    process.env.CRON_SECRET = "scheduler-test-secret";
    for (const header of [undefined, "Bearer invalid", "Bearer user-access-token", "Bearer scheduler-test-secreu"]) {
      await assert.rejects(runJob(request(header), {}, next), (error) => error.statusCode === 401);
    }
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous;
  }
});

test("upload signatures require an approved teacher's own course", async () => {
  const originalProfile = prisma.teacherProfile.findFirst;
  const originalCourse = prisma.course.findFirst;
  const next = (error) => { throw error; };
  const request = { authUser: { _id: "teacher" }, validatedParams: { courseId: "another-course" }, body: { kind: "video", name: "Lesson.mp4" } };
  try {
    prisma.teacherProfile.findFirst = async () => null;
    await assert.rejects(signLessonUpload(request, {}, next), (error) => error.statusCode === 403);
    prisma.teacherProfile.findFirst = async () => ({ id: "profile" });
    prisma.course.findFirst = async ({ where }) => {
      assert.equal(where.teacherId, "teacher");
      assert.equal(where.id, "another-course");
      return null;
    };
    await assert.rejects(signLessonUpload(request, {}, next), (error) => error.statusCode === 404);
  } finally {
    prisma.teacherProfile.findFirst = originalProfile;
    prisma.course.findFirst = originalCourse;
  }
});

test("JSON lesson creation saves verified media and does not persist upload tokens", async () => {
  const originalSecret = process.env.SECRET_KEY;
  const originalApiSecret = process.env.API_SECRET;
  const originalResource = cloudinary.api.resource;
  const originalProfile = prisma.teacherProfile.findFirst;
  const originalCourse = prisma.course.findFirst;
  const originalTransaction = prisma.$transaction;
  process.env.SECRET_KEY = "deployment-controller-test-secret";
  process.env.API_SECRET = "deployment-controller-provider-secret";
  try {
    const ticket = createLessonUpload({ teacherId: "teacher", courseId: "course", kind: "video", name: "Lesson.mp4" });
    cloudinary.api.resource = async () => ({ public_id: ticket.fields.public_id, resource_type: "video", type: "authenticated", bytes: 100, format: "mp4", duration: 20 });
    prisma.teacherProfile.findFirst = async () => ({ id: "profile" });
    prisma.course.findFirst = async () => ({ id: "course" });
    let saved;
    prisma.$transaction = async (callback) => callback({
      $queryRaw: async () => [],
      lesson: {
        findFirst: async () => null,
        create: async ({ data }) => { saved = data; return { id: "lesson", ...data }; },
      },
      mediaCleanupTask: { findFirst: async () => null },
      course: { findUnique: async () => ({ teacherId: "teacher" }) },
      user: { findMany: async () => [] },
      notificationFanout: { upsert: async () => ({}) },
    });
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await createLesson({ authUser: { _id: "teacher" }, validatedParams: { courseId: "course" }, body: {
      title: "Lesson", description: "Content", type: "recorded", isFree: false,
      availableFrom: "2026-12-01T10:00:00Z", availableUntil: "2026-12-31T10:00:00Z", videoUploadToken: ticket.uploadToken,
    } }, response, (error) => { throw error; });
    assert.equal(response.statusCode, 201);
    assert.equal(saved.video.publicId, ticket.fields.public_id);
    assert.equal(saved.status, "published");
    assert.equal(saved.videoUploadToken, undefined);
    assert.equal(saved.attachmentUploadTokens, undefined);
    assert.deepEqual(saved.attachments, []);
  } finally {
    cloudinary.api.resource = originalResource;
    prisma.teacherProfile.findFirst = originalProfile;
    prisma.course.findFirst = originalCourse;
    prisma.$transaction = originalTransaction;
    if (originalSecret === undefined) delete process.env.SECRET_KEY; else process.env.SECRET_KEY = originalSecret;
    if (originalApiSecret === undefined) delete process.env.API_SECRET; else process.env.API_SECRET = originalApiSecret;
  }
});

test("Vercel entry exports Express without opening a listener or starting worker timers", async () => {
  const previous = process.env.VERCEL;
  const previousUrl = process.env.NEON_DATABASE_URL;
  const originalConnect = prisma.$connect;
  const originalQuery = prisma.$queryRaw;
  const originalListen = express.application.listen;
  const originalInterval = globalThis.setInterval;
  let listeners = 0;
  let intervals = 0;
  try {
    process.env.VERCEL = "1";
    process.env.NEON_DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    prisma.$connect = async () => {};
    prisma.$queryRaw = async () => [{ result: 1 }];
    express.application.listen = () => { listeners++; };
    globalThis.setInterval = () => { intervals++; return { unref() {} }; };
    const { default: app } = await import("../index.js");
    assert.equal(typeof app, "function");
    assert.equal(listeners, 0);
    assert.equal(intervals, 0);
  } finally {
    prisma.$connect = originalConnect;
    prisma.$queryRaw = originalQuery;
    express.application.listen = originalListen;
    globalThis.setInterval = originalInterval;
    if (previous === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous;
    if (previousUrl === undefined) delete process.env.NEON_DATABASE_URL; else process.env.NEON_DATABASE_URL = previousUrl;
  }
});
