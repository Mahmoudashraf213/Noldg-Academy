import cors from "cors";
import { cleanupRequestUploads } from "./middleware/upload-cleanup.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { globalErrorHandling } from "./utils/appError.js";
import { apiSerializer } from "./utils/api-serializer.js";
import {
  academicRouter,
  authRouter,
  courseRouter,
  lessonRouter,
  productRouter,
  teacherRouter,
  userRouter,
  orderRouter,
  paymentRouter,
  orderApprovalRouter,
  entitlementRouter,
  ledgerRouter,
  learningRouter,
  questionRouter,
  assessmentRouter,
  attemptRouter,
  gradingRouter,
  notificationRouter,
  ratingRouter,
  settingsRouter,
  jobsRouter,
} from "./modules/index.js";

// Register shared middleware and the application's API routers.
export const bootStrap = (app, express) => {
  // parse req
  app.use(express.json({ limit: "100kb", inflate: false }));
  app.use(cleanupRequestUploads);
  app.use(apiSerializer);
  // cors edit
  const corsOptions = {
    origin: process.env.CLIENT_ORIGIN || "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: false,
  };
  app.use(cors(corsOptions));
  // routes
  app.use("/api", rateLimit({ scope: "api-ip", limit: 1000, windowMs: 60000 }));
  app.use("/api/auth", authRouter);
  app.use("/api/users", userRouter);
  app.use("/api/academic", academicRouter);
  app.use("/api/teachers", teacherRouter);
  app.use("/api/courses", courseRouter);
  app.use("/api/lessons", lessonRouter);
  app.use("/api/products", productRouter);
  app.use("/api/orders", orderRouter);
  app.use("/api/payments", paymentRouter);
  app.use("/api/order-approval", orderApprovalRouter);
  app.use("/api/entitlements", entitlementRouter);
  app.use("/api/ledger", ledgerRouter);
  app.use("/api/learning", learningRouter);
  app.use("/api/questions", questionRouter);
  app.use("/api/assessments", assessmentRouter);
  app.use("/api/attempts", attemptRouter);
  app.use("/api/grading", gradingRouter);
  app.use("/api/notifications", notificationRouter);
  app.use("/api/ratings", ratingRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/jobs", jobsRouter);
  // global error
  app.use(globalErrorHandling);
};
