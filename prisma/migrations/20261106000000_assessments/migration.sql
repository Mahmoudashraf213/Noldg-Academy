BEGIN;

-- CreateTable
CREATE TABLE "assessments" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "teacherId" VARCHAR(24) NOT NULL,
    "courseId" VARCHAR(24) NOT NULL,
    "lessonId" VARCHAR(24),
    "title" VARCHAR(150) NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "type" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "durationMinutes" INTEGER,
    "opensAt" TIMESTAMPTZ(3),
    "closesAt" TIMESTAMPTZ(3),
    "watchLessonId" VARCHAR(24),
    "requiredWatchPercentage" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "publishedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "assessmentId" VARCHAR(24) NOT NULL,
    "sourceQuestionId" VARCHAR(24),
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" JSONB,
    "points" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "assessmentId" VARCHAR(24) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'in_progress',
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" DOUBLE PRECISION NOT NULL,
    "autoScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION,
    "submissionReason" VARCHAR(32),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "gradedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_answers" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "attemptId" VARCHAR(24) NOT NULL,
    "assessmentQuestionId" VARCHAR(24) NOT NULL,
    "answer" JSONB,
    "pointsAwarded" DOUBLE PRECISION,
    "feedback" VARCHAR(1000) NOT NULL DEFAULT '',
    "gradedBy" VARCHAR(24),
    "gradedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assessment_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assessments_teacherId_createdAt_idx" ON "assessments"("teacherId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "assessments_courseId_status_idx" ON "assessments"("courseId", "status");

-- CreateIndex
CREATE INDEX "assessments_status_closesAt_idx" ON "assessments"("status", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessmentId_position_key" ON "assessment_questions"("assessmentId", "position");

-- CreateIndex
CREATE INDEX "assessment_attempts_studentId_assessmentId_attemptNumber_idx" ON "assessment_attempts"("studentId", "assessmentId", "attemptNumber" DESC);

-- CreateIndex
CREATE INDEX "assessment_attempts_status_expiresAt_idx" ON "assessment_attempts"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_attempts_assessmentId_studentId_attemptNumber_key" ON "assessment_attempts"("assessmentId", "studentId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_answers_attemptId_assessmentQuestionId_key" ON "assessment_answers"("attemptId", "assessmentQuestionId");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_watchLessonId_fkey" FOREIGN KEY ("watchLessonId") REFERENCES "lessons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_assessmentQuestionId_fkey" FOREIGN KEY ("assessmentQuestionId") REFERENCES "assessment_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_gradedBy_fkey" FOREIGN KEY ("gradedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "assessment_attempts_active_key" ON "assessment_attempts"("assessmentId", "studentId") WHERE "status" = 'in_progress';

ALTER TABLE "assessments" ADD CONSTRAINT "assessments_settings_check" CHECK (
    "type" IN ('quiz', 'homework', 'exam') AND "status" IN ('draft', 'published', 'closed')
    AND (("type" = 'exam' AND "lessonId" IS NULL) OR ("type" IN ('quiz', 'homework') AND "lessonId" IS NOT NULL))
    AND "maxAttempts" > 0 AND ("durationMinutes" IS NULL OR "durationMinutes" > 0)
    AND "totalPoints" > 0 AND "totalPoints" < 'Infinity'::double precision
    AND "requiredWatchPercentage" > 0 AND "requiredWatchPercentage" <= 100
    AND ("opensAt" IS NULL OR "closesAt" IS NULL OR "closesAt" > "opensAt")
);
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_settings_check" CHECK (
    "position" >= 0 AND "points" > 0 AND "points" <= 1000000
    AND "type" IN ('single_choice', 'multiple_choice', 'true_false', 'essay')
);
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_state_check" CHECK (
    "attemptNumber" > 0 AND "lastSequence" >= 0 AND "totalPoints" > 0 AND "totalPoints" < 'Infinity'::double precision
    AND "autoScore" >= 0 AND "autoScore" <= "totalPoints"
    AND (("status" = 'in_progress' AND "submittedAt" IS NULL AND "score" IS NULL)
      OR ("status" = 'submitted' AND "submittedAt" IS NOT NULL AND "score" IS NULL)
      OR ("status" = 'graded' AND "submittedAt" IS NOT NULL AND "gradedAt" IS NOT NULL AND "score" IS NOT NULL AND "score" >= 0 AND "score" <= "totalPoints"))
);
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_score_check" CHECK (
    "pointsAwarded" IS NULL OR ("pointsAwarded" >= 0 AND "pointsAwarded" < 'Infinity'::double precision)
);

COMMIT;
