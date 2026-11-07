import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import bcrypt from "bcrypt";
import { EventEmitter } from "node:events";

test("PostgreSQL security, concurrency, outbox and password recovery", { skip: !process.env.TEST_DATABASE_URL, timeout: 600000 }, async (t) => {
  const schema = `noldg_security_test_${randomBytes(8).toString("hex")}`;
  assert.match(schema, /^noldg_security_test_[a-f0-9]{16}$/);
  const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 15000 });
  let created = false;
  let prisma;
  const originalFetch = globalThis.fetch;
  try {
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    await admin.query(`SET search_path TO "${schema}"`);
    const directories = fs.readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const directory of directories) await admin.query(fs.readFileSync(path.join("prisma/migrations", directory.name, "migration.sql"), "utf8"));
    process.env.DATABASE_SCHEMA = schema;
    process.env.NEON_DATABASE_URL = process.env.TEST_DATABASE_URL;
    ({ prisma } = await import("../db/index.js"));
    const { updateUserStatus } = await import("../src/modules/user/user.controller.js");
    const { updateLesson } = await import("../src/modules/lesson/lesson.controller.js");
    const { cleanupExpiredLessonVideos } = await import("../src/modules/lesson/lesson.utils.js");
    const { notifyCourseStudents, processNotificationFanout } = await import("../src/modules/notification/notification.utils.js");
    const { forgotPassword, resetPassword } = await import("../src/modules/auth/password-reset.controller.js");
    const { deliverPasswordResetCode } = await import("../src/modules/auth/password-reset.utils.js");
    const { rateLimit } = await import("../src/middleware/rate-limit.js");
    const cloudinary = (await import("../src/utils/cloud.js")).default;
    const response = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return body; }, setHeader() {} });
    const next = (error) => { if (error) throw error; };
    const password = await bcrypt.hash("Before123!", 10);
    const createUser = (name, role) => prisma.user.create({ data: { name, email: `${name}@example.com`, phone: "+201012345678", password, roles: role } });
    const supers = await Promise.all([createUser("super-one", "super_admin"), createUser("super-two", "super_admin")]);

    await t.test("concurrent suspension cannot remove all active super admins", async () => {
      const results = await Promise.allSettled(supers.map((user) => updateUserStatus({ authUser: { id: user.id, roles: "super_admin" }, body: { status: "suspended" }, validatedParams: { userId: user.id } }, response(), next)));
      assert.ok(results.some((result) => result.status === "rejected"));
      assert.ok(await prisma.user.count({ where: { roles: "super_admin", status: "active" } }) >= 1);
    });

    const teacher = await createUser("teacher", "teacher");
    await prisma.teacherProfile.create({ data: { userId: teacher.id, approvalStatus: "approved" } });
    const track = await prisma.studyTrack.create({ data: { name: "Track", system: "general", stage: "secondary", grade: 1 } });
    const subject = await prisma.subject.create({ data: { name: "Subject" } });
    const course = await prisma.course.create({ data: { teacherId: teacher.id, trackId: track.id, subjectId: subject.id } });
    const lesson = await prisma.lesson.create({ data: { courseId: course.id, title: "Lesson", status: "draft", availableFrom: new Date(), availableUntil: new Date(Date.now() + 3600000) } });
    await t.test("concurrent direct-upload claims cannot attach the same asset twice", async () => {
      const { assertLessonUploadsUnused } = await import("../src/modules/lesson/lesson-upload.utils.js");
      for (const kind of ["video", "attachment"]) {
        const asset = { publicId: `test-direct-${randomBytes(12).toString("hex")}`, format: kind === "video" ? "mp4" : "pdf" };
        const claim = () => prisma.$transaction(async (transaction) => {
          await assertLessonUploadsUnused({ directAssets: [asset] }, transaction);
          return transaction.lesson.create({ data: {
            courseId: course.id, title: "Direct upload", availableFrom: new Date(), availableUntil: new Date(Date.now() + 3600000),
            ...(kind === "video" ? { video: asset } : { attachments: [asset] }),
          } });
        });
        const results = await Promise.allSettled([claim(), claim()]);
        assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
        const rejected = results.find((result) => result.status === "rejected");
        assert.equal(rejected.reason.statusCode, 400);
      }
    });
    cloudinary.uploader.upload = async () => ({ public_id: randomBytes(12).toString("hex"), format: "pdf" });
    const updateRequest = () => ({ authUser: { _id: teacher.id, id: teacher.id }, body: {}, validatedParams: { lessonId: lesson.id }, files: { attachments: [{ path: "nonexistent-test-fixture", originalname: "fixture.pdf" }] } });

    await t.test("concurrent lesson appends preserve every successful write", async () => {
      const results = await Promise.allSettled([updateLesson(updateRequest(), response(), next), updateLesson(updateRequest(), response(), next)]);
      for (const result of results) if (result.status === "rejected") {
        assert.equal(result.reason.code, "P2034");
        await updateLesson(updateRequest(), response(), next);
      }
      const saved = await prisma.lesson.findUnique({ where: { id: lesson.id } });
      assert.equal(saved.attachments.length, 2);
      assert.notEqual(saved.attachments[0].publicId, saved.attachments[1].publicId);
    });

    await t.test("retention compare-and-update preserves a replaced video", async () => {
      const stale = await prisma.lesson.update({ where: { id: lesson.id }, data: { availableUntil: new Date(Date.now() - 40 * 86400000), video: { publicId: "old", duration: 100, format: "mp4" } } });
      await prisma.lesson.update({ where: { id: lesson.id }, data: { video: { publicId: "new", duration: 100, format: "mp4" }, availableUntil: new Date(Date.now() + 86400000) } });
      const original = prisma.lesson.findMany;
      prisma.lesson.findMany = async () => [stale];
      try { await cleanupExpiredLessonVideos(); } finally { prisma.lesson.findMany = original; }
      assert.equal((await prisma.lesson.findUnique({ where: { id: lesson.id } })).video.publicId, "new");
    });

    const student = await createUser("student", "student");
    const manager = await createUser("manager", "admin");
    await t.test("fanout commits to an outbox, delivers, and is idempotent", async () => {
      const event = { courseId: course.id, isFree: true, type: "lesson_published", title: "New lesson", body: "Fixture", entityId: lesson.id, eventKey: "integration:lesson" };
      await prisma.$transaction((transaction) => notifyCourseStudents(event, transaction));
      assert.equal(await prisma.notification.count({ where: { userId: student.id, eventKey: event.eventKey } }), 0);
      await processNotificationFanout();
      assert.equal(await prisma.notification.count({ where: { userId: student.id, eventKey: event.eventKey } }), 1);
      await prisma.$transaction((transaction) => notifyCourseStudents(event, transaction));
      await processNotificationFanout();
      assert.equal(await prisma.notification.count({ where: { userId: student.id, eventKey: event.eventKey } }), 1);
    });

    await t.test("database rate limits count concurrent requests atomically", async () => {
      const limiter = rateLimit({ scope: "integration", limit: 2, windowMs: 60000 });
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => limiter({ ip: "127.0.0.77" }, response(), next)));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
      for (const result of results.filter((row) => row.status === "rejected")) assert.equal(result.reason.statusCode, 429);
    });

    await t.test("fanout persists a cursor and completes audiences larger than one batch", async () => {
      await prisma.user.createMany({ data: Array.from({ length: 1001 }, (_, index) => ({ name: `bulk-${index}`, email: `bulk-${index}@example.com`, phone: "00000000", password, roles: "student" })) });
      const event = { courseId: course.id, isFree: true, type: "lesson_published", title: "Batch", body: "Fixture", entityId: lesson.id, eventKey: "integration:large-audience" };
      await prisma.$transaction((transaction) => notifyCourseStudents(event, transaction));
      await processNotificationFanout();
      const pending = await prisma.notificationFanout.findUnique({ where: { eventKey: event.eventKey } });
      assert.equal(pending.status, "pending");
      assert.ok(pending.cursor);
      await processNotificationFanout();
      await processNotificationFanout();
      assert.equal((await prisma.notificationFanout.findUnique({ where: { eventKey: event.eventKey } })).status, "completed");
      assert.equal(await prisma.notification.count({ where: { eventKey: event.eventKey, user: { is: { roles: "student" } } } }), 1002);
    });

    await t.test("SSE enforces shared database leases and releases them on close", async () => {
      const { streamNotifications } = await import("../src/modules/notification/notification.controller.js");
      await prisma.notificationConnection.createMany({ data: [1, 2].map(() => ({ userId: student.id, expiresAt: new Date(Date.now() + 60000) })) });
      await assert.rejects(streamNotifications({ authUser: { id: student.id } }, response()), (error) => error.statusCode === 429);
      await prisma.notificationConnection.deleteMany({ where: { userId: student.id } });
      const res = Object.assign(new EventEmitter(), { writableEnded: false, setHeader() {}, flushHeaders() {}, write() { return true; }, end() { this.writableEnded = true; } });
      await streamNotifications({ authUser: { id: student.id } }, res);
      assert.equal(await prisma.notificationConnection.count({ where: { userId: student.id } }), 1);
      res.emit("close");
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(await prisma.notificationConnection.count({ where: { userId: student.id } }), 0);
    });

    await t.test("lesson and linked product names update atomically", async () => {
      const product = await prisma.product.create({ data: { courseId: course.id, lessonId: lesson.id, type: "lesson", name: "Lesson", price: 100 } });
      await updateLesson({ authUser: { _id: teacher.id, id: teacher.id }, validatedParams: { lessonId: lesson.id }, body: { title: "Renamed" }, files: {} }, response(), next);
      assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).name, "Renamed");
    });

    await t.test("media URLs never outlive the lesson window", async () => {
      const { getLessonAccess } = await import("../src/modules/lesson/lesson-access.controller.js");
      const updated = await prisma.lesson.update({ where: { id: lesson.id }, data: { status: "published", isFree: true, availableFrom: new Date(Date.now() - 60000), availableUntil: new Date(Date.now() + 15000) } });
      const session = await prisma.playbackSession.create({ data: { studentId: student.id, lessonId: lesson.id, videoPublicId: "new", durationSeconds: 100, authSessionVersion: 0, deviceId: "test-device", expiresAt: new Date(Date.now() + 120000) } });
      let signedExpiry;
      const original = cloudinary.utils.private_download_url;
      cloudinary.utils.private_download_url = (id, format, options) => { signedExpiry = options.expires_at; return "https://example.invalid/fixture"; };
      try {
        const res = response();
        await getLessonAccess({ authUser: { id: student.id, sessionVersion: 0, activeDeviceId: "test-device" }, validatedParams: { lessonId: lesson.id }, validatedQuery: { sessionId: session.id } }, res, next);
        assert.ok(signedExpiry <= Math.floor(updated.availableUntil.getTime() / 1000));
        assert.ok(res.body.data.mediaExpiresAt <= updated.availableUntil);
      } finally { cloudinary.utils.private_download_url = original; }
    });

    await t.test("failed teacher creation rolls back the user and compensates its image", async () => {
      const { signupTeacher } = await import("../src/modules/teacher/teacher.controller.js");
      await prisma.trackSubject.create({ data: { trackId: track.id, subjectId: subject.id } });
      const originalUpload = cloudinary.uploader.upload;
      const originalDestroy = cloudinary.uploader.destroy;
      let destroyed;
      cloudinary.uploader.upload = async () => ({ public_id: "uncommitted-image", secure_url: "https://example.invalid/image" });
      cloudinary.uploader.destroy = async (id) => { destroyed = id; return { result: "ok" }; };
      try {
        await assert.rejects(signupTeacher({ body: { name: "rollback-teacher", email: "rollback-teacher@example.com", phone: "+201012345678", password: "Before123!", bio: "x".repeat(1001), offerings: [{ trackId: track.id, subjectId: subject.id }] }, file: { path: "nonexistent-image-fixture" } }, response(), next), (error) => error.code === "P2000");
        assert.equal(await prisma.user.findUnique({ where: { name: "rollback-teacher" } }), null);
        assert.equal(destroyed, "uncommitted-image");
      } finally { cloudinary.uploader.upload = originalUpload; cloudinary.uploader.destroy = originalDestroy; }
    });

    await t.test("detached media cleanup retries a provider failure and completes afterward", async () => {
      const { queueMediaCleanup, cleanupDetachedMedia } = await import("../src/utils/media-cleanup.js");
      await prisma.mediaCleanupTask.updateMany({ where: { status: "pending" }, data: { nextAttemptAt: new Date(Date.now() + 3600000) } });
      const task = await queueMediaCleanup({ publicId: "detached-test-video" }, "video");
      const originalDestroy = cloudinary.uploader.destroy;
      const originalError = console.error;
      try {
        cloudinary.uploader.destroy = async () => { throw new Error("provider unavailable"); };
        console.error = () => {};
        await cleanupDetachedMedia();
        const retried = await prisma.mediaCleanupTask.findUnique({ where: { id: task.id } });
        assert.equal(retried.attempts, 1);
        assert.equal(retried.status, "pending");
        await prisma.mediaCleanupTask.update({ where: { id: task.id }, data: { nextAttemptAt: new Date(0) } });
        cloudinary.uploader.destroy = async () => ({ result: "ok" });
        await cleanupDetachedMedia();
        assert.equal((await prisma.mediaCleanupTask.findUnique({ where: { id: task.id } })).status, "completed");
      } finally { cloudinary.uploader.destroy = originalDestroy; console.error = originalError; }
    });

    process.env.WHATSAPP_ENABLED = "true";
    process.env.WHATSAPP_ACCESS_TOKEN = "test-only";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    process.env.WHATSAPP_API_VERSION = "v25.0";
    process.env.WHATSAPP_RESET_TEMPLATE = "approved_test_template";
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en_US";
    process.env.PASSWORD_RESET_SECRET = randomBytes(32).toString("hex");
    let deliveredCode;
    globalThis.fetch = async (url, options) => {
      const payload = JSON.parse(options.body);
      deliveredCode = payload.template.components[0].parameters[0].text;
      assert.equal(payload.template.components[1].parameters[0].text, deliveredCode);
      return { ok: true, json: async () => ({ messages: [{ id: "test-message" }] }) };
    };

    for (const user of [student, teacher, manager]) await t.test(`WhatsApp reset for ${user.roles} consumes code and revokes sessions`, async () => {
      const requested = response();
      await forgotPassword({ body: { email: user.email } }, requested);
      const stored = await prisma.passwordReset.findUnique({ where: { userId: user.id } });
      assert.equal(stored.delivered, false);
      assert.equal(stored.codeHash.length, 64);
      assert.equal(requested.body.code, undefined);
      await deliverPasswordResetCode();
      assert.ok(deliveredCode);
      assert.notEqual(stored.codeHash, deliveredCode);
      const before = (await prisma.user.findUnique({ where: { id: user.id } })).sessionVersion;
      const results = await Promise.allSettled([1, 2].map(() => resetPassword({ body: { email: user.email, code: deliveredCode, password: "After123!" } }, response(), next)));
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const saved = await prisma.user.findUnique({ where: { id: user.id } });
      assert.equal(saved.sessionVersion, before + 1);
      assert.equal(saved.activeDeviceId, null);
      assert.equal(await bcrypt.compare("After123!", saved.password), true);
      assert.equal(await prisma.passwordReset.findUnique({ where: { userId: user.id } }), null);
    });

    await t.test("unknown and super-admin accounts receive the same generic recovery response", async () => {
      const unknown = response();
      const excluded = response();
      await forgotPassword({ body: { email: "missing@example.com" } }, unknown);
      await forgotPassword({ body: { email: supers[0].email } }, excluded);
      assert.deepEqual(unknown.body, excluded.body);
      assert.equal(await prisma.passwordReset.count(), 0);
    });

    await t.test("wrong codes are counted, expiry and cooldown are enforced", async () => {
      await forgotPassword({ body: { email: student.email } }, response());
      const first = await prisma.passwordReset.findUnique({ where: { userId: student.id } });
      await forgotPassword({ body: { email: student.email } }, response());
      assert.equal((await prisma.passwordReset.findUnique({ where: { userId: student.id } })).challengeId, first.challengeId);
      await deliverPasswordResetCode();
      const wrong = deliveredCode === "000000" ? "000001" : "000000";
      for (let index = 0; index < 5; index++) await assert.rejects(resetPassword({ body: { email: student.email, code: wrong, password: "After123!" } }, response(), next), (error) => error.statusCode === 400);
      assert.equal((await prisma.passwordReset.findUnique({ where: { userId: student.id } })).attempts, 5);
      await assert.rejects(resetPassword({ body: { email: student.email, code: deliveredCode, password: "After123!" } }, response(), next), (error) => error.statusCode === 400);
      await prisma.passwordReset.update({ where: { userId: student.id }, data: { attempts: 0, expiresAt: new Date(Date.now() - 60000) } });
      await assert.rejects(resetPassword({ body: { email: student.email, code: deliveredCode, password: "After123!" } }, response(), next), (error) => error.statusCode === 400);
    });

    await t.test("provider failures retry a bounded number of times and never enable reset", async () => {
      await prisma.passwordReset.deleteMany({ where: { userId: student.id } });
      await forgotPassword({ body: { email: student.email } }, response());
      globalThis.fetch = async () => ({ ok: false });
      const originalError = console.error;
      console.error = () => {};
      try {
        for (let index = 0; index < 3; index++) {
          await prisma.passwordReset.update({ where: { userId: student.id }, data: { nextDeliveryAt: new Date(0) } });
          await deliverPasswordResetCode();
        }
      } finally { console.error = originalError; }
      const challenge = await prisma.passwordReset.findUnique({ where: { userId: student.id } });
      assert.equal(challenge.deliveryAttempts, 3);
      assert.equal(challenge.delivered, false);
      await assert.rejects(resetPassword({ body: { email: student.email, code: "123456", password: "After123!" } }, response(), next), (error) => error.statusCode === 400);
    });

    await t.test("security cleanup removes expired challenges using PostgreSQL time", async () => {
      const { cleanupSecurityRecords } = await import("../src/utils/security-cleanup.js");
      await prisma.passwordReset.update({ where: { userId: student.id }, data: { expiresAt: new Date(Date.now() - 60000) } });
      await cleanupSecurityRecords();
      assert.equal(await prisma.passwordReset.count(), 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (prisma) await prisma.$disconnect();
    if (created) {
      assert.match(schema, /^noldg_security_test_[a-f0-9]{16}$/);
      await admin.query("SET search_path TO public");
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await admin.end();
  }
});
