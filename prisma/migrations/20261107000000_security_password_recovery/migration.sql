BEGIN;

-- CreateTable
CREATE TABLE "security_rate_limits" (
    "key" VARCHAR(64) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "security_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "userId" VARCHAR(24) NOT NULL,
    "challengeId" VARCHAR(32) NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "encryptedCode" VARCHAR(128),
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextDeliveryAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phone" VARCHAR(64) NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notification_connections" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "userId" VARCHAR(24) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_fanouts" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "eventKey" VARCHAR(255) NOT NULL,
    "payload" JSONB NOT NULL,
    "cursor" VARCHAR(24),
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_fanouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_cleanup_tasks" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "asset" JSONB NOT NULL,
    "resourceType" VARCHAR(32) NOT NULL,
    "authenticated" BOOLEAN NOT NULL DEFAULT true,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_cleanup_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_rate_limits_expiresAt_idx" ON "security_rate_limits"("expiresAt");

-- CreateIndex
CREATE INDEX "password_resets_expiresAt_idx" ON "password_resets"("expiresAt");

-- CreateIndex
CREATE INDEX "notification_connections_userId_expiresAt_idx" ON "notification_connections"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "notification_connections_expiresAt_idx" ON "notification_connections"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_fanouts_eventKey_key" ON "notification_fanouts"("eventKey");

-- CreateIndex
CREATE INDEX "notification_fanouts_status_nextAttemptAt_createdAt_idx" ON "notification_fanouts"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "media_cleanup_tasks_status_nextAttemptAt_createdAt_idx" ON "media_cleanup_tasks"("status", "nextAttemptAt", "createdAt");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_connections" ADD CONSTRAINT "notification_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
