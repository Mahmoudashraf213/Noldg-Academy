import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import express from "express";
import { generalFields } from "../src/utils/generalFields.js";
import { loginSchema } from "../src/modules/auth/auth.validation.js";
import { createLessonSchema } from "../src/modules/lesson/lesson.validation.js";
import { teacherSignupSchema } from "../src/modules/teacher/teacher.validation.js";
import { cleanupRequestUploads } from "../src/middleware/upload-cleanup.js";
import { cloudUploads, lessonUploads } from "../src/utils/multer-cloud.js";
import { isValid } from "../src/middleware/vaildation.js";
import { AppError, globalErrorHandling } from "../src/utils/appError.js";
import { assertWhatsAppResetConfigured, normalizeWhatsAppPhone } from "../src/utils/whatsapp.js";
import { encryptResetCode } from "../src/modules/auth/password-reset.utils.js";
import { prisma } from "../db/index.js";
import { cleanupExpiredAssessmentAttempts } from "../src/modules/attempt/attempt.utils.js";
import { asyncHandler } from "../src/middleware/asyncHandler.js";

test("new and login passwords reject bcrypt truncation including Unicode", () => {
  const prefix = "Aa1!" + "x".repeat(68);
  assert.equal(generalFields.password.validate(prefix).error, undefined);
  assert.ok(generalFields.password.validate(prefix + "x").error);
  assert.ok(generalFields.password.validate("Aa1!" + "ع".repeat(35)).error);
  assert.ok(loginSchema.validate({ email: "student@example.com", password: prefix + "x" }).error);
});

test("validators reject invalid calendar dates and values outside database bounds", () => {
  for (const value of ["2026-99-99T12:00:00Z", "2026-02-30T12:00:00Z", "2025-02-29T12:00:00Z"]) assert.ok(generalFields.dateTime.validate(value).error);
  assert.equal(generalFields.dateTime.validate("2028-02-29T12:00:00+02:00").error, undefined);
  assert.ok(generalFields.name.validate("x".repeat(256)).error);
  assert.ok(generalFields.phone.validate("x".repeat(65)).error);
  assert.ok(generalFields.price.validate(2147483648).error);
  assert.ok(generalFields.lessonCount.validate(2147483648).error);
  assert.ok(createLessonSchema.validate({ title: "Lesson", description: "Content", type: "recorded", availableFrom: "2026-99-99T12:00:00Z", availableUntil: "2026-99-99T13:00:00Z" }).error);
});

test("WhatsApp recovery is unavailable without configuration and phone normalization is explicit", () => {
  const previous = process.env.WHATSAPP_ENABLED;
  process.env.WHATSAPP_ENABLED = "false";
  assert.throws(assertWhatsAppResetConfigured, (error) => error instanceof AppError && error.statusCode === 503);
  if (previous === undefined) delete process.env.WHATSAPP_ENABLED; else process.env.WHATSAPP_ENABLED = previous;
  assert.equal(normalizeWhatsAppPhone("+20 101 234 5678"), "201012345678");
  assert.equal(normalizeWhatsAppPhone("00201012345678"), "201012345678");
  assert.equal(normalizeWhatsAppPhone("invalid"), null);
});

test("delivery encryption does not store a plaintext code and uses fresh nonces", () => {
  const previous = process.env.PASSWORD_RESET_SECRET;
  process.env.PASSWORD_RESET_SECRET = "unit-test-secret-".repeat(4);
  const first = encryptResetCode("123456");
  const second = encryptResetCode("123456");
  assert.notEqual(first, second);
  assert.ok(!Buffer.from(first, "base64").includes(Buffer.from("123456")));
  if (previous === undefined) delete process.env.PASSWORD_RESET_SECRET; else process.env.PASSWORD_RESET_SECRET = previous;
});

test("failed automatic submissions do not starve later pages", async () => {
  const originalTransaction = prisma.$transaction;
  const originalFind = prisma.assessmentAttempt.findMany;
  const originalError = console.error;
  let pages = 0;
  const visited = [];
  prisma.assessmentAttempt.findMany = async () => Array.from({ length: pages++ === 0 ? 50 : 1 }, (_, index) => ({ id: `${pages}:${index}`, startedAt: new Date() }));
  prisma.$transaction = async (callback) => callback({ assessment: { updateManyAndReturn: async () => [] }, assessmentAttempt: { findUnique: async ({ where }) => { visited.push(where.id); if (where.id === "1:0") throw new Error("invalid first attempt"); return null; } } });
  console.error = () => {};
  try { await cleanupExpiredAssessmentAttempts(); } finally {
    prisma.$transaction = originalTransaction;
    prisma.assessmentAttempt.findMany = originalFind;
    console.error = originalError;
  }
  assert.equal(visited.length, 51);
  assert.equal(pages, 2);
});

test("referenced-record errors become conflicts instead of internal errors", async () => {
  const error = await new Promise((resolve) => asyncHandler(async () => { throw Object.assign(new Error("foreign key"), { code: "P2003" }); })({}, {}, resolve));
  assert.equal(error.statusCode, 409);
});

test("HTTP upload failures clean temporary files, enforce limits, and preserve parser error statuses", async () => {
  const app = express();
  const uploadedPaths = [];
  app.use(cleanupRequestUploads);
  app.use(express.json({ limit: "100kb", inflate: false }));
  app.post("/upload", cloudUploads().single("image"), (req, res, next) => { if (req.file) uploadedPaths.push(req.file.path); next(); }, isValid(teacherSignupSchema), (req, res) => res.sendStatus(200));
  app.post("/lesson", lessonUploads(), (req, res) => res.sendStatus(200));
  app.use(globalErrorHandling);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const invalid = new FormData();
    invalid.append("image", new Blob(["test fixture"], { type: "image/png" }), "fixture.png");
    assert.equal((await fetch(url + "/upload", { method: "POST", body: invalid })).status, 400);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(uploadedPaths.length, 1);
    assert.equal(fs.existsSync(uploadedPaths[0]), false);
    const large = new FormData();
    large.append("image", new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: "image/png" }), "large.png");
    assert.equal((await fetch(url + "/upload", { method: "POST", body: large })).status, 413);
    const attachment = new FormData();
    attachment.append("attachments", new Blob([Buffer.alloc(25 * 1024 * 1024 + 1)], { type: "application/pdf" }), "large.pdf");
    assert.equal((await fetch(url + "/lesson", { method: "POST", body: attachment })).status, 413);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(103000) }) })).status, 413);
    assert.equal((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" }, body: "unused" })).status, 415);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
