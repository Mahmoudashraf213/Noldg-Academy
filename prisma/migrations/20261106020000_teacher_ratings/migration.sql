CREATE TABLE "teacher_ratings" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "studentId" VARCHAR(24) NOT NULL,
    "teacherId" VARCHAR(24) NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" VARCHAR(500) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "teacher_ratings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "teacher_ratings_stars_check" CHECK ("stars" BETWEEN 1 AND 5),
    CONSTRAINT "teacher_ratings_different_users_check" CHECK ("studentId" <> "teacherId")
);

CREATE UNIQUE INDEX "teacher_ratings_studentId_teacherId_key" ON "teacher_ratings"("studentId", "teacherId");
CREATE INDEX "teacher_ratings_teacherId_createdAt_idx" ON "teacher_ratings"("teacherId", "createdAt" DESC);
ALTER TABLE "teacher_ratings" ADD CONSTRAINT "teacher_ratings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_ratings" ADD CONSTRAINT "teacher_ratings_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
