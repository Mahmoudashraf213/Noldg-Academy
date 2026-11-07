import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import {
  createTeacherPayout,
  getLedgerEntries,
  getLedgerEntryById,
  getLedgerReport,
  getTeacherBalances,
} from "./ledger.controller.js";
import {
  createTeacherPayoutSchema,
  getLedgerBalancesSchema,
  getLedgerEntriesSchema,
  getLedgerReportSchema,
  ledgerEntryIdParamsSchema,
} from "./ledger.validation.js";

const ledgerRouter = Router();
const isSuperAdmin = isAuthorized([roles.SUPER_ADMIN]);
const isAccountManager = isAuthorized([roles.ADMIN, roles.SUPER_ADMIN]);

// Account managers record manual payouts and view their own outstanding liabilities.
ledgerRouter.post(
  "/payouts",
  isAuthenticated(),
  isAccountManager,
  isValid(createTeacherPayoutSchema),
  asyncHandler(createTeacherPayout)
);
ledgerRouter.get(
  "/balances",
  isAuthenticated(),
  isAccountManager,
  isValid(getLedgerBalancesSchema, "query"),
  asyncHandler(getTeacherBalances)
);

// Only the super admin may inspect platform-wide financial movements and reports.
ledgerRouter.get(
  "/reports",
  isAuthenticated(),
  isSuperAdmin,
  isValid(getLedgerReportSchema, "query"),
  asyncHandler(getLedgerReport)
);
ledgerRouter.get(
  "/",
  isAuthenticated(),
  isSuperAdmin,
  isValid(getLedgerEntriesSchema, "query"),
  asyncHandler(getLedgerEntries)
);
ledgerRouter.get(
  "/:entryId",
  isAuthenticated(),
  isSuperAdmin,
  isValid(ledgerEntryIdParamsSchema, "params"),
  asyncHandler(getLedgerEntryById)
);

export default ledgerRouter;
