import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { prisma } from "../db/index.js";
import { login, logout } from "../src/modules/auth/auth.controller.js";
import { isAuthenticated } from "../src/middleware/authentication.js";
import { verifyToken } from "../src/utils/token.js";

test("login replaces the previous session without requiring logout", async (t) => {
  const originalFindUser = prisma.user.findFirst;
  const originalFindDevice = prisma.device.findFirst;
  const originalTransaction = prisma.$transaction;
  const previousSecret = process.env.SECRET_KEY;
  const previousTtl = process.env.ACCESS_TOKEN_TTL;
  const password = await bcrypt.hash("Before123!", 10);
  let user;
  let devices;
  const reset = () => {
    user = { id: "student", email: "student@example.com", password, status: "active", isVerified: true, sessionVersion: 0, activeDeviceId: null, activeSessionExpiresAt: null };
    devices = [];
    process.env.ACCESS_TOKEN_TTL = "none";
  };
  const response = () => ({ status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return body; } });
  const next = (error) => { if (error) throw error; };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const authenticate = async (token) => {
    const req = { headers: { token } };
    await isAuthenticated()(req, {}, next);
    return req.authUser;
  };
  const loginFrom = async (ip, suppliedPassword = "Before123!") => {
    const res = response();
    await login({ body: { email: user.email, password: suppliedPassword }, ip, get: () => "Test browser" }, res, next);
    assert.equal(res.statusCode, 200);
    return res.body.token;
  };
  try {
    process.env.SECRET_KEY = "auth-session-test-secret";
    prisma.user.findFirst = async () => structuredClone(user);
    prisma.device.findFirst = async ({ where }) => devices.find((device) => matches(device, where)) || null;
    prisma.$transaction = async (callback) => callback({
      $queryRaw: async () => [{ id: user.id }],
      user: {
        findUnique: async () => structuredClone(user),
        update: async ({ data }) => {
          user = { ...user, ...data, sessionVersion: user.sessionVersion + data.sessionVersion.increment };
          return structuredClone(user);
        },
        updateMany: async ({ where, data }) => {
          if (!matches(user, where)) return { count: 0 };
          user = { ...user, ...data, sessionVersion: user.sessionVersion + data.sessionVersion.increment };
          return { count: 1 };
        },
      },
      device: {
        updateMany: async ({ where, data }) => {
          for (const device of devices.filter((row) => matches(row, where))) Object.assign(device, data);
        },
        upsert: async ({ where, update, create }) => {
          const existing = devices.find((device) => matches(device, where.userId_deviceId));
          if (existing) Object.assign(existing, update); else devices.push({ ...create });
        },
      },
    });

    await t.test("a new device invalidates an unlimited old token and deactivates the old device", async () => {
      reset();
      const first = await loginFrom("192.0.2.1");
      assert.equal(verifyToken(first).exp, undefined);
      await authenticate(first);
      const second = await loginFrom("192.0.2.2");
      await assert.rejects(authenticate(first), (error) => error.statusCode === 401);
      await authenticate(second);
      assert.equal(devices.filter((device) => device.status === "active").length, 1);
      assert.equal(devices.find((device) => device.deviceId === verifyToken(first).deviceId).status, "inactive");
    });

    await t.test("an unexpired timed session is replaced and its old device can log in again", async () => {
      reset();
      process.env.ACCESS_TOKEN_TTL = "5h";
      const first = await loginFrom("192.0.2.1");
      assert.ok(user.activeSessionExpiresAt > new Date());
      const second = await loginFrom("192.0.2.2");
      await assert.rejects(authenticate(first), (error) => error.statusCode === 401);
      const third = await loginFrom("192.0.2.1");
      await assert.rejects(authenticate(second), (error) => error.statusCode === 401);
      await authenticate(third);
      assert.equal(devices.length, 2);
      assert.equal(devices.filter((device) => device.status === "active").length, 1);
    });

    await t.test("a delayed logout cannot terminate a replacement session even on the same device", async () => {
      reset();
      const first = await loginFrom("192.0.2.1");
      const oldAuthUser = await authenticate(first);
      const second = await loginFrom("192.0.2.1");
      await logout({ authUser: oldAuthUser }, response());
      await authenticate(second);
      await assert.rejects(authenticate(first), (error) => error.statusCode === 401);
    });

    await t.test("logout still invalidates the current session", async () => {
      reset();
      const token = await loginFrom("192.0.2.1");
      await logout({ authUser: await authenticate(token) }, response());
      await assert.rejects(authenticate(token), (error) => error.statusCode === 401);
      assert.equal(user.activeDeviceId, null);
      assert.equal(devices.filter((device) => device.status === "active").length, 0);
    });

    await t.test("invalid passwords and suspended accounts cannot replace a session", async () => {
      reset();
      const token = await loginFrom("192.0.2.1");
      const version = user.sessionVersion;
      await assert.rejects(loginFrom("192.0.2.2", "Wrong123!"), (error) => error.statusCode === 401);
      await authenticate(token);
      user.status = "suspended";
      await assert.rejects(loginFrom("192.0.2.2"), (error) => error.statusCode === 403);
      assert.equal(user.sessionVersion, version);
    });
  } finally {
    prisma.user.findFirst = originalFindUser;
    prisma.device.findFirst = originalFindDevice;
    prisma.$transaction = originalTransaction;
    if (previousSecret === undefined) delete process.env.SECRET_KEY; else process.env.SECRET_KEY = previousSecret;
    if (previousTtl === undefined) delete process.env.ACCESS_TOKEN_TTL; else process.env.ACCESS_TOKEN_TTL = previousTtl;
  }
});
