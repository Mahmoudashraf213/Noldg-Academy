// Roles used by authentication and authorization checks.
export const roles = {
  STUDENT: "student",
  TEACHER: "teacher",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

// Account states used to allow or block access.
export const userStatuses = {
  ACTIVE: "active",
  SUSPENDED: "suspended",
};

// Device registration states and transfer-request decisions.
export const deviceStatuses = {
  ACTIVE: "active",
  INACTIVE: "inactive",
};

// Academic systems and stages supported by the platform.
export const academicSystems = {
  GENERAL: "general",
  LANGUAGES: "languages",
  AL_AZHAR: "al_azhar",
  EGYPTIAN_BACCALAUREATE: "egyptian_baccalaureate",
  AMERICAN_DIPLOMA: "american_diploma",
};

export const academicStages = {
  PREPARATORY: "preparatory",
  SECONDARY: "secondary",
};

// Teacher application review states.
export const teacherApprovalStatuses = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// Lesson formats and publication lifecycle states.
export const lessonTypes = {
  RECORDED: "recorded",
  LIVE: "live",
};

export const lessonStatuses = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
};

// Purchaseable product types that grant lesson access.
export const productTypes = {
  LESSON: "lesson",
  PACKAGE: "package",
};

// Order and manual payment states used by purchase approval.
export const orderStatuses = {
  PENDING_PAYMENT: "pending_payment",
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const paymentStatuses = {
  SUBMITTED: "submitted",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
};

// Distinguish paid access from an educational grant issued by an account manager.
export const entitlementSources = {
  PURCHASE: "purchase",
  COMPLIMENTARY: "complimentary",
};

// Financial entries are immutable sales or recorded manual teacher payouts.
export const ledgerEntryTypes = {
  SALE: "sale",
  TEACHER_PAYOUT: "teacher_payout",
};

export const ledgerReportPeriods = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  YEARLY: "yearly",
};

// Question bank types shared by assessments without binding questions to a course.
export const questionTypes = {
  SINGLE_CHOICE: "single_choice",
  MULTIPLE_CHOICE: "multiple_choice",
  TRUE_FALSE: "true_false",
  ESSAY: "essay",
};

export const assessmentTypes = {
  QUIZ: "quiz",
  HOMEWORK: "homework",
  EXAM: "exam",
};

export const assessmentStatuses = {
  DRAFT: "draft",
  PUBLISHED: "published",
  CLOSED: "closed",
};

export const attemptStatuses = {
  IN_PROGRESS: "in_progress",
  SUBMITTED: "submitted",
  GRADED: "graded",
};

