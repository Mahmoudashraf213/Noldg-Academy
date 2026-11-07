BEGIN;

-- CreateTable
CREATE TABLE "questions" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "teacherId" VARCHAR(24) NOT NULL,
    "text" TEXT NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "correctAnswer" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questions_teacherId_type_createdAt_idx" ON "questions"("teacherId", "type", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep objective answer keys typed and essays free of automatic answer keys.
ALTER TABLE "questions" ADD CONSTRAINT "questions_content_check" CHECK (
    "type" IN ('single_choice', 'multiple_choice', 'true_false', 'essay')
    AND jsonb_typeof("options") = 'array'
    AND CASE "type"
        WHEN 'single_choice' THEN jsonb_array_length("options") >= 2
            AND "correctAnswer" IS NOT NULL AND jsonb_typeof("correctAnswer") = 'number'
        WHEN 'multiple_choice' THEN jsonb_array_length("options") >= 2
            AND "correctAnswer" IS NOT NULL AND jsonb_typeof("correctAnswer") = 'array'
            AND jsonb_array_length("correctAnswer") >= 1
        WHEN 'true_false' THEN "options" = '[]'::jsonb
            AND "correctAnswer" IS NOT NULL AND jsonb_typeof("correctAnswer") = 'boolean'
        WHEN 'essay' THEN "options" = '[]'::jsonb AND "correctAnswer" IS NULL
        ELSE false
    END
);

COMMIT;
