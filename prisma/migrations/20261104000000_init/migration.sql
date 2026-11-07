-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(64) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT true,
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "activeDeviceId" VARCHAR(255),
    "activeSessionExpiresAt" TIMESTAMPTZ(3),
    "roles" VARCHAR(32) NOT NULL DEFAULT 'student',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "userId" VARCHAR(24) NOT NULL,
    "deviceId" VARCHAR(255) NOT NULL,
    "ipAddress" VARCHAR(64) NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_tracks" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "system" VARCHAR(64) NOT NULL,
    "stage" VARCHAR(32) NOT NULL,
    "grade" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "study_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "name" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_subjects" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "trackId" VARCHAR(24) NOT NULL,
    "subjectId" VARCHAR(24) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "track_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "userId" VARCHAR(24) NOT NULL,
    "bio" VARCHAR(1000) NOT NULL DEFAULT '',
    "profileImage" JSONB,
    "commissionPercentage" DOUBLE PRECISION,
    "approvalStatus" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "reviewedBy" VARCHAR(24),
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_offerings" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "teacherProfileId" VARCHAR(24) NOT NULL,
    "trackId" VARCHAR(24) NOT NULL,
    "subjectId" VARCHAR(24) NOT NULL,

    CONSTRAINT "teacher_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "teacherId" VARCHAR(24) NOT NULL,
    "trackId" VARCHAR(24) NOT NULL,
    "subjectId" VARCHAR(24) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "courseId" VARCHAR(24) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" VARCHAR(32) NOT NULL DEFAULT 'recorded',
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "availableFrom" TIMESTAMPTZ(3) NOT NULL,
    "availableUntil" TIMESTAMPTZ(3) NOT NULL,
    "video" JSONB,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "courseId" VARCHAR(24) NOT NULL,
    "lessonId" VARCHAR(24),
    "type" VARCHAR(32) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "price" INTEGER NOT NULL,
    "announcedLessonCount" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_accesses" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "studentId" VARCHAR(24) NOT NULL,
    "productId" VARCHAR(24) NOT NULL,
    "confirmedBy" VARCHAR(24),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'platform',
    "settingsKey" VARCHAR(32) NOT NULL DEFAULT 'platform',
    "commissionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_name_key" ON "users"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "devices_userId_status_idx" ON "devices"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "devices_userId_deviceId_key" ON "devices"("userId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "study_tracks_system_stage_grade_key" ON "study_tracks"("system", "stage", "grade");

-- CreateIndex
CREATE INDEX "subjects_name_idx" ON "subjects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "track_subjects_trackId_subjectId_key" ON "track_subjects"("trackId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_userId_key" ON "teacher_profiles"("userId");

-- CreateIndex
CREATE INDEX "teacher_profiles_approvalStatus_createdAt_idx" ON "teacher_profiles"("approvalStatus", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "teacher_offerings_trackId_subjectId_idx" ON "teacher_offerings"("trackId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_offerings_teacherProfileId_trackId_subjectId_key" ON "teacher_offerings"("teacherProfileId", "trackId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "courses_teacherId_trackId_subjectId_key" ON "courses"("teacherId", "trackId", "subjectId");

-- CreateIndex
CREATE INDEX "lessons_courseId_status_availableFrom_availableUntil_idx" ON "lessons"("courseId", "status", "availableFrom", "availableUntil");

-- CreateIndex
CREATE INDEX "lessons_availableUntil_idx" ON "lessons"("availableUntil");

-- CreateIndex
CREATE UNIQUE INDEX "products_lessonId_key" ON "products"("lessonId");

-- CreateIndex
CREATE INDEX "products_courseId_type_idx" ON "products"("courseId", "type");

-- CreateIndex
CREATE INDEX "products_courseId_name_type_idx" ON "products"("courseId", "name", "type");

-- CreateIndex
CREATE INDEX "product_accesses_productId_idx" ON "product_accesses"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_accesses_studentId_productId_key" ON "product_accesses"("studentId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_settings_settingsKey_key" ON "platform_settings"("settingsKey");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_subjects" ADD CONSTRAINT "track_subjects_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "study_tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_subjects" ADD CONSTRAINT "track_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_offerings" ADD CONSTRAINT "teacher_offerings_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_offerings" ADD CONSTRAINT "teacher_offerings_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "study_tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_offerings" ADD CONSTRAINT "teacher_offerings_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "study_tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accesses" ADD CONSTRAINT "product_accesses_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accesses" ADD CONSTRAINT "product_accesses_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_accesses" ADD CONSTRAINT "product_accesses_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
