// Re-export the shared Prisma client and generated model delegates.
export { prisma } from "./prisma.js";
export { prisma as default } from "./prisma.js";

import { prisma } from "./prisma.js";

export const User = prisma.user;
export const Device = prisma.device;
export const StudyTrack = prisma.studyTrack;
export const Subject = prisma.subject;
export const TrackSubject = prisma.trackSubject;
export const TeacherProfile = prisma.teacherProfile;
export const TeacherOffering = prisma.teacherOffering;
export const Course = prisma.course;
export const Lesson = prisma.lesson;
export const Product = prisma.product;
export const ProductAccess = prisma.productAccess;
export const PlatformSettings = prisma.platformSettings;
export const Order = prisma.order;
export const Payment = prisma.payment;
export const OrderApproval = prisma.orderApproval;
export const OrderNotification = prisma.orderNotification;
export const Notification = prisma.notification;
export const TeacherRating = prisma.teacherRating;
export const LedgerEntry = prisma.ledgerEntry;
export const LessonProgress = prisma.lessonProgress;
export const PlaybackSession = prisma.playbackSession;
export const Question = prisma.question;
export const Assessment = prisma.assessment;
export const AssessmentQuestion = prisma.assessmentQuestion;
export const AssessmentAttempt = prisma.assessmentAttempt;
export const AssessmentAnswer = prisma.assessmentAnswer;
