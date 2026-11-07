import { Prisma } from "@prisma/client";
import { ledgerEntryTypes } from "../../utils/constant/enum.js";

// Copy the saved order amounts rather than recalculating historical commissions.
export const recordOrderSale = async (order, { receivedBy, recordedBy, occurredAt }, transaction) =>
  transaction.ledgerEntry.create({
    data: {
      type: ledgerEntryTypes.SALE,
      referenceNumber: order.referenceNumber,
      orderId: order.id,
      paymentId: order.payment.id,
      studentId: order.studentId,
      productId: order.productId,
      teacherId: order.teacherId,
      receivedBy,
      recordedBy,
      amount: order.salePrice,
      platformAmount: new Prisma.Decimal(order.platformAmount).toFixed(2),
      teacherAmount: new Prisma.Decimal(order.teacherAmount).toFixed(2),
      commissionPercentage: new Prisma.Decimal(order.commissionPercentage).toFixed(2),
      productName: order.productName,
      occurredAt,
    },
  });

// Preserve exact decimal amounts through the API's identifier serializer.
export const formatLedgerEntry = (entry) => ({
  ...entry,
  amount: entry.amount.toFixed(2),
  platformAmount: entry.platformAmount.toFixed(2),
  teacherAmount: entry.teacherAmount.toFixed(2),
  commissionPercentage: entry.commissionPercentage?.toFixed(2) ?? null,
});

// Build the existing Prisma filter shape for financial movement lists.
export const getLedgerWhere = (query) => {
  const where = {};
  for (const field of ["type", "studentId", "teacherId", "productId", "receivedBy", "recordedBy", "referenceNumber", "isHistorical"]) {
    if (query[field] !== undefined) where[field] = query[field];
  }
  if (query.from || query.to) {
    where.occurredAt = {
      ...(query.from && { gte: query.from }),
      ...(query.to && { lt: query.to }),
    };
  }
  return where;
};

// Parameterize report values and restrict SQL identifiers to the known filter fields.
export const getLedgerSqlConditions = (query) => {
  const conditions = [];
  for (const field of ["type", "studentId", "teacherId", "productId", "receivedBy", "recordedBy", "referenceNumber", "isHistorical"]) {
    if (query[field] !== undefined) {
      conditions.push(Prisma.sql`${Prisma.raw(`"${field}"`)} = ${query[field]}`);
    }
  }
  if (query.from) conditions.push(Prisma.sql`"occurredAt" >= ${query.from}`);
  if (query.to) conditions.push(Prisma.sql`"occurredAt" < ${query.to}`);
  return conditions.length ? Prisma.join(conditions, " AND ") : Prisma.sql`TRUE`;
};

// Report interval movements separately from all-time outstanding teacher balances.
export const formatLedgerTotals = (values) => {
  const grossSales = new Prisma.Decimal(values.grossSales ?? 0);
  const platformRevenue = new Prisma.Decimal(values.platformRevenue ?? 0);
  const teacherEarnings = new Prisma.Decimal(values.teacherEarnings ?? 0);
  const teacherPayouts = new Prisma.Decimal(values.teacherPayouts ?? 0);
  return {
    salesCount: Number(values.salesCount ?? 0),
    payoutCount: Number(values.payoutCount ?? 0),
    grossSales: grossSales.toFixed(2),
    platformRevenue: platformRevenue.toFixed(2),
    teacherEarnings: teacherEarnings.toFixed(2),
    teacherPayouts: teacherPayouts.toFixed(2),
    cashNetMovement: grossSales.minus(teacherPayouts).toFixed(2),
    teacherNetMovement: teacherEarnings.minus(teacherPayouts).toFixed(2),
  };
};

// Aggregate immutable entries using PostgreSQL exact numeric arithmetic.
export const ledgerTotalsSql = Prisma.sql`
  COUNT(*) FILTER (WHERE "type" = 'sale') AS "salesCount",
  COUNT(*) FILTER (WHERE "type" = 'teacher_payout') AS "payoutCount",
  COALESCE(SUM(CASE WHEN "type" = 'sale' THEN "amount" ELSE 0 END), 0) AS "grossSales",
  COALESCE(SUM(CASE WHEN "type" = 'sale' THEN "platformAmount" ELSE 0 END), 0) AS "platformRevenue",
  COALESCE(SUM(CASE WHEN "type" = 'sale' THEN "teacherAmount" ELSE 0 END), 0) AS "teacherEarnings",
  COALESCE(SUM(CASE WHEN "type" = 'teacher_payout' THEN "amount" ELSE 0 END), 0) AS "teacherPayouts"`;
