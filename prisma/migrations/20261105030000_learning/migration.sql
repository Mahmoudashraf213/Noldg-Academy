BEGIN;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "prerequisiteLessonId" VARCHAR(24),
ADD COLUMN     "requiredWatchPercentage" DOUBLE PRECISION NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "lesson_progress" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "studentId" VARCHAR(24) NOT NULL,
    "lessonId" VARCHAR(24) NOT NULL,
    "videoPublicId" VARCHAR(255) NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "watchedRanges" JSONB NOT NULL DEFAULT '[]',
    "watchedSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playback_sessions" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "studentId" VARCHAR(24) NOT NULL,
    "lessonId" VARCHAR(24) NOT NULL,
    "videoPublicId" VARCHAR(255) NOT NULL,
    "durationSeconds" DOUBLE PRECISION NOT NULL,
    "authSessionVersion" INTEGER NOT NULL,
    "deviceId" VARCHAR(255) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "lastPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "playbackRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isPlaying" BOOLEAN NOT NULL DEFAULT true,
    "timeBudgetSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "lastHeartbeatAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "playback_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lesson_progress_studentId_lessonId_videoPublicId_key" ON "lesson_progress"("studentId", "lessonId", "videoPublicId");

-- CreateIndex
CREATE INDEX "playback_sessions_studentId_status_idx" ON "playback_sessions"("studentId", "status");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_prerequisiteLessonId_fkey" FOREIGN KEY ("prerequisiteLessonId") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only one live playback record may exist per student, even during simultaneous starts.
CREATE UNIQUE INDEX "playback_sessions_studentId_active_key" ON "playback_sessions"("studentId") WHERE "status" = 'active';

ALTER TABLE "lessons" ADD CONSTRAINT "lessons_watch_requirement_check" CHECK (
    "requiredWatchPercentage" > 0 AND "requiredWatchPercentage" <= 100
    AND ("prerequisiteLessonId" IS NULL OR "prerequisiteLessonId" <> "id")
);
ALTER TABLE "lesson_progress" ADD CONSTRAINT "lesson_progress_seconds_check" CHECK (
    "durationSeconds" > 0 AND "watchedSeconds" >= 0 AND "watchedSeconds" <= "durationSeconds"
    AND "lastPosition" >= 0 AND "lastPosition" <= "durationSeconds"
);
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_bounds_check" CHECK (
    "status" IN ('active', 'closed') AND "durationSeconds" > 0
    AND "lastPosition" >= 0 AND "lastPosition" <= "durationSeconds"
    AND "playbackRate" >= 0.25 AND "playbackRate" <= 2 AND "lastSequence" >= 0
);

COMMIT;
