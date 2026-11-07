// Export feature routers for application startup.
import authRouter from "./auth/auth.router.js";
import academicRouter from "./academic/academic.router.js";
import teacherRouter from "./teacher/teacher.router.js";
import userRouter from "./user/user.router.js";
import courseRouter from "./course/course.router.js";
import lessonRouter from "./lesson/lesson.router.js";
import productRouter from "./product/product.router.js";
import orderRouter from "./order/order.router.js";
import paymentRouter from "./payment/payment.router.js";
import orderApprovalRouter from "./order-approval/order-approval.router.js";
import entitlementRouter from "./entitlement/entitlement.router.js";
import ledgerRouter from "./ledger/ledger.router.js";
import learningRouter from "./learning/learning.router.js";
import questionRouter from "./question/question.router.js";
import assessmentRouter from "./assessment/assessment.router.js";
import attemptRouter from "./attempt/attempt.router.js";
import gradingRouter from "./grading/grading.router.js";
import notificationRouter from "./notification/notification.router.js";
import ratingRouter from "./rating/rating.router.js";
import settingsRouter from "./settings/settings.router.js";
import jobsRouter from "./jobs/jobs.router.js";

export { academicRouter, authRouter, courseRouter, lessonRouter, productRouter, teacherRouter, userRouter, orderRouter, paymentRouter, orderApprovalRouter, entitlementRouter, ledgerRouter, learningRouter, questionRouter, assessmentRouter, attemptRouter, gradingRouter, notificationRouter, ratingRouter, settingsRouter, jobsRouter };
