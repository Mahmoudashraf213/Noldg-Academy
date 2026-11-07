BEGIN;

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" VARCHAR(24) NOT NULL DEFAULT substr(md5(random()::text || clock_timestamp()::text), 1, 24),
    "type" VARCHAR(32) NOT NULL,
    "referenceNumber" VARCHAR(64) NOT NULL,
    "orderId" VARCHAR(24),
    "paymentId" VARCHAR(24),
    "studentId" VARCHAR(24),
    "productId" VARCHAR(24),
    "teacherId" VARCHAR(24) NOT NULL,
    "receivedBy" VARCHAR(24) NOT NULL,
    "recordedBy" VARCHAR(24) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "platformAmount" DECIMAL(14,2) NOT NULL,
    "teacherAmount" DECIMAL(14,2) NOT NULL,
    "commissionPercentage" DECIMAL(5,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EGP',
    "productName" VARCHAR(255),
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',
    "idempotencyKey" VARCHAR(128),
    "isHistorical" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_referenceNumber_key" ON "ledger_entries"("referenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_orderId_key" ON "ledger_entries"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_paymentId_key" ON "ledger_entries"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_idempotencyKey_key" ON "ledger_entries"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ledger_entries_occurredAt_id_idx" ON "ledger_entries"("occurredAt" DESC, "id");

-- CreateIndex
CREATE INDEX "ledger_entries_teacherId_receivedBy_type_idx" ON "ledger_entries"("teacherId", "receivedBy", "type");

-- CreateIndex
CREATE INDEX "ledger_entries_studentId_occurredAt_idx" ON "ledger_entries"("studentId", "occurredAt" DESC);

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep every approved historical sale at its original price and approval time.
-- The original reviewer is the assumed cash holder because no separate receiver was saved.
INSERT INTO "ledger_entries" (
    "type", "referenceNumber", "orderId", "paymentId", "studentId", "productId",
    "teacherId", "receivedBy", "recordedBy", "amount", "platformAmount", "teacherAmount",
    "commissionPercentage", "productName", "notes", "isHistorical", "occurredAt"
)
SELECT 'sale', o."referenceNumber", o."id", p."id", o."studentId", o."productId",
    o."teacherId", a."reviewedBy", a."reviewedBy", o."salePrice",
    ROUND(o."platformAmount"::numeric, 2), ROUND(o."teacherAmount"::numeric, 2),
    ROUND(o."commissionPercentage"::numeric, 2), o."productName",
    'Historical sale: cash holder inferred from the original approval reviewer', true, a."reviewedAt"
FROM "orders" o
JOIN "payments" p ON p."orderId" = o."id" AND p."status" = 'confirmed'
JOIN "order_approvals" a ON a."orderId" = o."id" AND a."status" = 'approved'
WHERE o."status" = 'approved'
ON CONFLICT ("orderId") DO NOTHING;

-- Reject inconsistent amounts and keep the ledger restricted to the supported movement types.
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amounts_check" CHECK (
    "currency" = 'EGP' AND "amount" > 0 AND "platformAmount" >= 0 AND "teacherAmount" >= 0
    AND "amount" = "platformAmount" + "teacherAmount"
    AND (
        ("type" = 'sale' AND "orderId" IS NOT NULL AND "paymentId" IS NOT NULL
            AND "studentId" IS NOT NULL AND "productId" IS NOT NULL
            AND "commissionPercentage" BETWEEN 0 AND 100 AND "commissionPercentage" IS NOT NULL)
        OR
        ("type" = 'teacher_payout' AND "orderId" IS NULL AND "paymentId" IS NULL
            AND "studentId" IS NULL AND "productId" IS NULL AND "commissionPercentage" IS NULL
            AND "platformAmount" = 0 AND "idempotencyKey" IS NOT NULL)
    )
);

-- Enforce append-only storage even for direct SQL UPDATE, DELETE, and TRUNCATE statements.
CREATE FUNCTION "prevent_ledger_entry_changes"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries are append-only and cannot be updated, deleted, or truncated'
        USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_append_only"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "ledger_entries"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_ledger_entry_changes"();

COMMIT;
