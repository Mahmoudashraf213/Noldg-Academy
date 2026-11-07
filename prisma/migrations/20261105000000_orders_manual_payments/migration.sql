-- CreateTable
CREATE TABLE "orders" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "referenceNumber" VARCHAR(64) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "teacherId" VARCHAR(24) NOT NULL,
    "productId" VARCHAR(24) NOT NULL,
    "createdBy" VARCHAR(24) NOT NULL,
    "productName" VARCHAR(255) NOT NULL,
    "productType" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
    "fullPrice" INTEGER NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "announcedLessonCount" INTEGER NOT NULL,
    "remainingLessonCount" INTEGER NOT NULL,
    "commissionPercentage" DOUBLE PRECISION NOT NULL,
    "platformAmount" DOUBLE PRECISION NOT NULL,
    "teacherAmount" DOUBLE PRECISION NOT NULL,
    "calculatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "orderId" VARCHAR(24) NOT NULL,
    "submittedBy" VARCHAR(24) NOT NULL,
    "method" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "status" VARCHAR(32) NOT NULL DEFAULT 'submitted',
    "amount" INTEGER NOT NULL,
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_approvals" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "orderId" VARCHAR(24) NOT NULL,
    "reviewedBy" VARCHAR(24) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "reason" VARCHAR(1000) NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_notifications" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "orderId" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_referenceNumber_key" ON "orders"("referenceNumber");

-- Prevent concurrent purchases of the same product until an earlier order is rejected.
CREATE UNIQUE INDEX "orders_studentId_productId_open_key" ON "orders"("studentId", "productId") WHERE "status" <> 'rejected';

-- CreateIndex
CREATE INDEX "orders_studentId_createdAt_idx" ON "orders"("studentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "orders_teacherId_createdAt_idx" ON "orders"("teacherId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "orders"("status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "payments_orderId_key" ON "payments"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_approvals_orderId_key" ON "order_approvals"("orderId");

-- CreateIndex
CREATE INDEX "order_notifications_userId_readAt_createdAt_idx" ON "order_notifications"("userId", "readAt", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "order_notifications_orderId_userId_key" ON "order_notifications"("orderId", "userId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_approvals" ADD CONSTRAINT "order_approvals_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_approvals" ADD CONSTRAINT "order_approvals_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_notifications" ADD CONSTRAINT "order_notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_notifications" ADD CONSTRAINT "order_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
