import { randomUUID } from "crypto";
import { fanoutNotification } from "../notification/notification.utils.js";
import { Prisma } from "@prisma/client";
import { LedgerEntry, prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { ledgerEntryTypes, roles } from "../../utils/constant/enum.js";
import {
  formatLedgerEntry,
  formatLedgerTotals,
  getLedgerSqlConditions,
  getLedgerWhere,
  ledgerTotalsSql,
} from "./ledger.utils.js";

// Allow the super admin to inspect immutable financial movements.
export const getLedgerEntries = async (req, res) => {
  const { page, limit } = req.validatedQuery;
  const where = getLedgerWhere(req.validatedQuery);
  const [entries, total] = await Promise.all([
    LedgerEntry.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true } },
        student: { select: { id: true, name: true } },
        receiver: { select: { id: true, name: true } },
        recorder: { select: { id: true, name: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    LedgerEntry.count({ where }),
  ]);
  return res.status(200).json({
    message: messages.ledger.fetchedSuccessfully,
    success: true,
    count: total,
    data: entries.map(formatLedgerEntry),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// Return one financial record with the same immutable snapshot amounts.
export const getLedgerEntryById = async (req, res, next) => {
  const entry = await LedgerEntry.findUnique({ where: { id: req.validatedParams.entryId } });
  if (!entry) {
    return next(new AppError(messages.ledger.notExist, 404));
  }
  return res.status(200).json({
    message: messages.ledger.fetchedSuccessfully,
    success: true,
    data: formatLedgerEntry(entry),
  });
};

// Record a manual cash payout without exceeding the teacher's balance with its holder.
export const createTeacherPayout = async (req, res) => {
  const { teacherId, amount, notes, idempotencyKey, paidAt } = req.body;
  const receivedBy = req.body.receivedBy || req.authUser.id;
  if (req.authUser.roles !== roles.SUPER_ADMIN && receivedBy !== req.authUser.id) {
    throw new AppError(messages.user.unauthorized, 403);
  }
  const result = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.ledgerEntry.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (
        existing.type !== ledgerEntryTypes.TEACHER_PAYOUT ||
        existing.teacherId !== teacherId || existing.receivedBy !== receivedBy ||
        existing.recordedBy !== req.authUser.id || !existing.amount.equals(amount) ||
        existing.notes !== notes || (paidAt && existing.occurredAt.getTime() !== paidAt.getTime())
      ) {
        throw new AppError(messages.ledger.idempotencyConflict, 409);
      }
      return { entry: existing, created: false };
    }
    const teacher = await transaction.user.findFirst({
      where: { id: teacherId, roles: roles.TEACHER },
      select: { id: true },
    });
    if (!teacher) throw new AppError(messages.ledger.teacherNotFound, 404);
    const receiver = await transaction.user.findFirst({
      where: { id: receivedBy, roles: { in: [roles.ADMIN, roles.SUPER_ADMIN] } },
      select: { id: true },
    });
    if (!receiver) throw new AppError(messages.ledger.receiverNotFound, 404);

    const earnings = await transaction.ledgerEntry.aggregate({
      where: { teacherId, receivedBy, type: ledgerEntryTypes.SALE },
      _sum: { teacherAmount: true },
    });
    const payouts = await transaction.ledgerEntry.aggregate({
      where: { teacherId, receivedBy, type: ledgerEntryTypes.TEACHER_PAYOUT },
      _sum: { amount: true },
    });
    const outstanding = new Prisma.Decimal(earnings._sum.teacherAmount ?? 0)
      .minus(payouts._sum.amount ?? 0);
    if (outstanding.lessThan(amount)) {
      throw new AppError(messages.ledger.insufficientBalance, 409);
    }
    const entry = await transaction.ledgerEntry.create({
      data: {
        type: ledgerEntryTypes.TEACHER_PAYOUT,
        referenceNumber: `PAY-${randomUUID()}`,
        teacherId,
        receivedBy,
        recordedBy: req.authUser.id,
        amount,
        platformAmount: 0,
        teacherAmount: amount,
        notes,
        idempotencyKey,
        occurredAt: paidAt || new Date(),
      },
    });
    await fanoutNotification({
      userIds: [teacherId, receivedBy], managerRoles: [roles.SUPER_ADMIN],
      type: "teacher_payout", title: "Teacher payout recorded", body: `Payout ${entry.referenceNumber}: ${amount} EGP`,
      entityId: entry.id, eventKey: `teacher_payout:${entry.id}`,
    }, transaction);
    return { entry, created: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return res.status(result.created ? 201 : 200).json({
    message: messages.ledger.payoutRecorded,
    success: true,
    data: formatLedgerEntry(result.entry),
  });
};

// Calculate all-time teacher balances; admins can only see cash they hold themselves.
export const getTeacherBalances = async (req, res, next) => {
  const query = { ...req.validatedQuery };
  if (req.authUser.roles !== roles.SUPER_ADMIN) {
    if (query.receivedBy && query.receivedBy !== req.authUser.id) {
      return next(new AppError(messages.user.unauthorized, 403));
    }
    query.receivedBy = req.authUser.id;
  }
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT "teacherId", "receivedBy", ${ledgerTotalsSql}
    FROM "ledger_entries"
    WHERE ${getLedgerSqlConditions(query)}
    GROUP BY "teacherId", "receivedBy"
    ORDER BY "teacherId", "receivedBy"`);
  return res.status(200).json({
    message: messages.ledger.balancesFetched,
    success: true,
    count: rows.length,
    data: rows.map((row) => {
      const totals = formatLedgerTotals(row);
      return { teacherId: row.teacherId, receivedBy: row.receivedBy, currency: "EGP", ...totals, outstanding: totals.teacherNetMovement };
    }),
  });
};

// Group financial movements by local calendar period without revaluing old sales.
export const getLedgerReport = async (req, res) => {
  const query = req.validatedQuery;
  const periods = { daily: "day", weekly: "week", monthly: "month", quarterly: "quarter", yearly: "year" };
  const dimensions = { teacher: '"teacherId"', student: '"studentId"', admin: '"receivedBy"', product: '"productId"' };
  const dimension = query.dimension ? Prisma.raw(dimensions[query.dimension]) : Prisma.sql`NULL::text`;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT to_char(date_trunc(${periods[query.period]}, "occurredAt" AT TIME ZONE 'Africa/Cairo'), 'YYYY-MM-DD') AS "periodStart",
      ${dimension} AS "dimensionId", ${ledgerTotalsSql}
    FROM "ledger_entries"
    WHERE ${getLedgerSqlConditions(query)}
    GROUP BY "periodStart", "dimensionId"
    ORDER BY "periodStart", "dimensionId"`);
  const totals = { salesCount: 0, payoutCount: 0, grossSales: new Prisma.Decimal(0), platformRevenue: new Prisma.Decimal(0), teacherEarnings: new Prisma.Decimal(0), teacherPayouts: new Prisma.Decimal(0) };
  for (const row of rows) {
    totals.salesCount += Number(row.salesCount);
    totals.payoutCount += Number(row.payoutCount);
    for (const field of ["grossSales", "platformRevenue", "teacherEarnings", "teacherPayouts"]) {
      totals[field] = totals[field].plus(row[field]);
    }
  }
  return res.status(200).json({
    message: messages.ledger.reportsFetched,
    success: true,
    data: {
      currency: "EGP",
      timeZone: "Africa/Cairo",
      period: query.period,
      dimension: query.dimension ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      totals: formatLedgerTotals(totals),
      breakdown: rows.map((row) => ({ periodStart: row.periodStart, dimensionId: row.dimensionId, ...formatLedgerTotals(row) })),
    },
  });
};
