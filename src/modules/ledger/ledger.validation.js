import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { ledgerEntryTypes, ledgerReportPeriods } from "../../utils/constant/enum.js";

// Keep financial filters shared between the movement list and reports.
const ledgerFilters = {
  type: joi.string().valid(...Object.values(ledgerEntryTypes)).optional(),
  studentId: generalFields.objectId.optional(),
  teacherId: generalFields.objectId.optional(),
  productId: generalFields.objectId.optional(),
  receivedBy: generalFields.objectId.optional(),
  recordedBy: generalFields.objectId.optional(),
  referenceNumber: joi.string().trim().max(64).optional(),
  from: joi.date().iso().optional(),
  to: joi.date().iso().optional(),
  isHistorical: joi.boolean().optional(),
};

const validateDateRange = (value, helpers) => {
  if (value.from && value.to && value.to <= value.from) {
    return helpers.error("any.invalid");
  }
  return value;
};

// Validate the paginated append-only movement list.
export const getLedgerEntriesSchema = joi.object({
  ...ledgerFilters,
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
}).custom(validateDateRange);

// Group reports by Cairo calendar periods and an optional business dimension.
export const getLedgerReportSchema = joi.object({
  ...ledgerFilters,
  period: joi.string().valid(...Object.values(ledgerReportPeriods)).default(ledgerReportPeriods.MONTHLY),
  dimension: joi.string().valid("teacher", "student", "admin", "product").optional(),
}).custom(validateDateRange);

// Inspect the all-time amount owed to a teacher by a receiving account manager.
export const getLedgerBalancesSchema = joi.object({
  teacherId: generalFields.objectId.optional(),
  receivedBy: generalFields.objectId.optional(),
});

// A stable request key prevents retrying a manual payout from recording it twice.
export const createTeacherPayoutSchema = joi.object({
  teacherId: generalFields.objectId.required(),
  receivedBy: generalFields.objectId.optional(),
  amount: joi.number().positive().max(999999999999.99).precision(2).strict().required(),
  notes: joi.string().trim().max(1000).required(),
  idempotencyKey: joi.string().trim().min(8).max(128).required(),
  paidAt: joi.date().iso().max("now").optional(),
});

export const ledgerEntryIdParamsSchema = joi.object({
  entryId: generalFields.objectId.required(),
});
