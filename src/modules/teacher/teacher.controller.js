import { AppError } from "../../utils/appError.js";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";
import { messages } from "../../utils/constant/messages.js";
import bcrypt from "bcrypt";
import {
  roles,
  teacherApprovalStatuses,
  userStatuses,
} from "../../utils/constant/enum.js";
import {
  prisma,
  TeacherProfile,
  TrackSubject,
  User,
} from "../../../db/index.js";
import cloudinary, { deleteCloudImage } from "../../utils/cloud.js";
import { deleteFile } from "../../utils/file-functions.js";
import { queueMediaCleanup } from "../../utils/media-cleanup.js";
import { syncTeacherCourses } from "../course/course.utils.js";

// Upload a temporary teacher image to Cloudinary and remove its local copy.
const uploadTeacherImage = async (file) => {
  try {
    const uploadedImage = await cloudinary.uploader.upload(file.path, {
      folder: "noldg_academy/teachers",
    });

    return {
      url: uploadedImage.secure_url,
      publicId: uploadedImage.public_id,
    };
  } finally {
    deleteFile(file.path);
  }
};

const discardTeacherImage = async (image) => {
  if (!image?.publicId) return;
  try { await deleteCloudImage(image.publicId); } catch {
    await queueMediaCleanup(image, "image", false).catch((error) => console.error(messages.error.cleanupFailed, error.code || error.name));
  }
};

// Keep the existing teacher response shape while reading normalized offering rows.
const formatTeacherProfile = (profile, populatedOfferings = false) => {
  if (!profile) return profile;
  const { offerings, ...profileData } = profile;

  return {
    ...profileData,
    ...(offerings && {
      offerings: offerings.map(({ trackId, subjectId, track, subject }) => ({
        trackId: populatedOfferings ? track : trackId,
        subjectId: populatedOfferings ? subject : subjectId,
      })),
    }),
  };
};

// Check that every declared subject is linked to an active study track.
const validateOfferings = async (offerings) => {
  const keys = offerings.map(
    ({ trackId, subjectId }) => `${trackId}:${subjectId}`
  );

  if (new Set(keys).size !== keys.length) {
    return { error: messages.teacher.duplicateOffering };
  }

  const links = await TrackSubject.findMany({
    where: {
      OR: offerings.map(({ trackId, subjectId }) => ({ trackId, subjectId })),
      track: { is: { isActive: true } },
      subject: { is: { isActive: true } },
    },
    select: { trackId: true, subjectId: true },
  });
  const activeKeys = new Set(
    links.map(({ trackId, subjectId }) => `${trackId}:${subjectId}`)
  );

  if (keys.some((key) => !activeKeys.has(key))) {
    return { error: messages.teacher.offeringNotFound };
  }

  return { value: offerings };
};

// Create a teacher account and submit its profile for approval.
export const signupTeacher = async (req, res, next) => {
  const { name, email, phone, password, bio, offerings } = req.body;
  const validation = await validateOfferings(offerings);
  if (validation.error) {
    return next(new AppError(validation.error, 400));
  }

  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  const userExists = await User.findFirst({
    where: { OR: [{ email: normalizedEmail }, { name: trimmedName }] },
  });

  if (userExists) {
    return next(new AppError(messages.user.alreadyExist, 409));
  }

  const profileImage = req.file ? await uploadTeacherImage(req.file) : null;
  const hashedPassword = await bcrypt.hash(password, 10);
  let result;
  try {
    result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: trimmedName,
          email: normalizedEmail,
          phone,
          password: hashedPassword,
          roles: roles.TEACHER,
          status: userStatuses.ACTIVE,
          isVerified: true,
        },
      });
      const application = await transaction.teacherProfile.create({
        data: {
          userId: user.id,
          bio,
          profileImage,
          offerings: { create: offerings },
        },
        include: { offerings: true },
      });

      await fanoutNotification({
        userIds: [user.id], managerRoles: notificationManagers,
        type: "teacher_application_submitted", title: "Teacher application submitted", body: user.name,
        entityId: application.id, eventKey: `teacher_application:${application.id}`,
      }, transaction);
      await syncTeacherCourses(user.id, offerings, transaction);
      return { user, application };
    });
  } catch (error) {
    await discardTeacherImage(profileImage);
    throw error;
  }
  const { user, application } = result;

  return res.status(201).json({
    message: messages.teacher.signupCreated,
    success: true,
    data: {
      user: { _id: user.id, name: user.name, email: user.email, roles: user.roles },
      application: formatTeacherProfile(application),
    },
  });
};

// Resubmit a rejected teacher application with updated teaching declarations.
export const applyAsTeacher = async (req, res, next) => {
  if (req.authUser.roles !== roles.TEACHER) {
    return next(new AppError(messages.teacher.userNotEligible, 403));
  }

  const validation = await validateOfferings(req.body.offerings);
  if (validation.error) {
    return next(new AppError(validation.error, 400));
  }

  const existingApplication = await TeacherProfile.findUnique({
    where: { userId: req.authUser.id },
    include: { offerings: true },
  });

  if (!existingApplication) {
    return next(new AppError(messages.teacher.applicationNotFound, 404));
  }

  if (existingApplication.approvalStatus !== teacherApprovalStatuses.REJECTED) {
    return next(new AppError(messages.teacher.applicationAlreadyExists, 409));
  }

  const profileImage = req.file ? await uploadTeacherImage(req.file) : undefined;
  const previousImagePublicId = existingApplication.profileImage?.publicId;
  let application;
  try {
    application = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.teacherProfile.update({
        where: { id: existingApplication.id },
        data: {
          bio: req.body.bio,
          approvalStatus: teacherApprovalStatuses.PENDING,
          reviewedBy: null,
          reviewedAt: null,
          ...(profileImage && { profileImage }),
          offerings: {
            deleteMany: {},
            create: req.body.offerings,
          },
        },
        include: { offerings: true },
      });
      await fanoutNotification({
        userIds: [updated.userId], managerRoles: notificationManagers,
        type: "teacher_application_submitted", title: "Teacher application resubmitted", body: req.authUser.name,
        entityId: updated.id, eventKey: `teacher_application:${updated.id}:${updated.updatedAt.toISOString()}`,
      }, transaction);
      await syncTeacherCourses(existingApplication.userId, req.body.offerings, transaction);
      if (profileImage && previousImagePublicId) await queueMediaCleanup({ publicId: previousImagePublicId }, "image", false, transaction);
      return updated;
    });
  } catch (error) {
    await discardTeacherImage(profileImage);
    throw error;
  }

  return res.status(201).json({
    message: messages.teacher.applicationCreated,
    success: true,
    data: formatTeacherProfile(application),
  });
};

// Update the authenticated applicant's or teacher's profile and offerings.
export const updateMyTeacherProfile = async (req, res, next) => {
  const { name, email, phone, bio, offerings } = req.body;
  if (
    name === undefined &&
    email === undefined &&
    phone === undefined &&
    bio === undefined &&
    offerings === undefined &&
    !req.file
  ) {
    return next(new AppError(messages.teacher.profileUpdateRequired, 400));
  }

  if (offerings !== undefined) {
    const validation = await validateOfferings(offerings);
    if (validation.error) {
      return next(new AppError(validation.error, 400));
    }
  }

  const profile = await TeacherProfile.findFirst({
    where: {
      userId: req.authUser.id,
      approvalStatus: {
        in: [teacherApprovalStatuses.PENDING, teacherApprovalStatuses.APPROVED],
      },
    },
    include: { offerings: true },
  });

  if (!profile) {
    return next(new AppError(messages.teacher.applicationNotFound, 404));
  }

  const user = await User.findUnique({ where: { id: req.authUser.id } });
  if (!user) {
    return next(new AppError(messages.user.notExist, 404));
  }

  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail && normalizedEmail !== user.email) {
    const emailExists = await User.findUnique({ where: { email: normalizedEmail } });
    if (emailExists) {
      return next(new AppError(messages.user.emailTaken, 409));
    }
  }

  const normalizedName = name?.trim();
  if (normalizedName && normalizedName !== user.name) {
    const nameExists = await User.findFirst({
      where: { name: normalizedName, id: { not: user.id } },
    });
    if (nameExists) {
      return next(new AppError(messages.user.nameTaken, 409));
    }
  }

  const profileImage = req.file ? await uploadTeacherImage(req.file) : undefined;
  const previousImagePublicId = profile.profileImage?.publicId;
  const userData = {
    ...(normalizedEmail && { email: normalizedEmail }),
    ...(normalizedName && { name: normalizedName }),
    ...(phone && { phone }),
  };
  let updatedProfile;
  try {
    updatedProfile = await prisma.$transaction(async (transaction) => {
      if (Object.keys(userData).length > 0) {
        await transaction.user.update({
          where: { id: user.id },
          data: userData,
        });
      }

      const updated = await transaction.teacherProfile.update({
        where: { id: profile.id },
        data: {
          ...(bio !== undefined && { bio }),
          ...(profileImage && { profileImage }),
          ...(offerings !== undefined && {
            offerings: { deleteMany: {}, create: offerings },
          }),
        },
        include: { offerings: true },
      });
      if (offerings !== undefined) await syncTeacherCourses(profile.userId, offerings, transaction);
      if (profileImage && previousImagePublicId) await queueMediaCleanup({ publicId: previousImagePublicId }, "image", false, transaction);
      return updated;
    });
  } catch (error) {
    await discardTeacherImage(profileImage);
    throw error;
  }

  return res.status(200).json({
    message: messages.teacher.profileUpdated,
    success: true,
    data: formatTeacherProfile(updatedProfile),
  });
};

// Return the authenticated user's current teacher application.
export const getMyTeacherApplication = async (req, res, next) => {
  const application = await TeacherProfile.findUnique({
    where: { userId: req.authUser.id },
    include: {
      offerings: {
        include: {
          track: { select: { id: true, system: true, stage: true, grade: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!application) {
    return next(new AppError(messages.teacher.applicationNotFound, 404));
  }

  return res.status(200).json({
    message: messages.teacher.fetchedSuccessfully,
    success: true,
    data: formatTeacherProfile(application, true),
  });
};

// List teacher applications for account managers.
export const getTeacherApplications = async (req, res) => {
  const { page, limit, status } = req.validatedQuery;
  const skip = (page - 1) * limit;
  const where = { approvalStatus: status ?? teacherApprovalStatuses.PENDING };
  const [applications, total] = await Promise.all([
    TeacherProfile.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, roles: true } },
        offerings: {
          include: {
            track: { select: { id: true, system: true, stage: true, grade: true, name: true } },
            subject: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    TeacherProfile.count({ where }),
  ]);

  const data = applications.map(({ user, ...profile }) =>
    formatTeacherProfile({ ...profile, userId: user }, true)
  );

  return res.status(200).json({
    message: messages.teacher.fetchedSuccessfully,
    success: true,
    count: total,
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// Approve or reject a pending teacher application.
export const reviewTeacherApplication = async (req, res, next) => {
  const { applicationId } = req.validatedParams;
  const { status } = req.body;
  const application = await TeacherProfile.findFirst({
    where: { id: applicationId, approvalStatus: teacherApprovalStatuses.PENDING },
  });

  if (!application) {
    return next(new AppError(messages.teacher.applicationNotFound, 404));
  }

  if (status === teacherApprovalStatuses.APPROVED) {
    const user = await User.findFirst({
      where: {
        id: application.userId,
        roles: roles.TEACHER,
        status: userStatuses.ACTIVE,
      },
    });

    if (!user) {
      return next(new AppError(messages.teacher.userNotActive, 409));
    }
  }

  const updatedApplication = await prisma.$transaction(async (transaction) => {
    const review = await transaction.teacherProfile.updateMany({
      where: { id: applicationId, approvalStatus: teacherApprovalStatuses.PENDING },
      data: {
        approvalStatus: status,
        reviewedBy: req.authUser.id,
        reviewedAt: new Date(),
      },
    });

    if (!review.count) throw new AppError(messages.teacher.applicationNotFound, 404);
    const updated = await transaction.teacherProfile.findUnique({
      where: { id: applicationId },
      include: { offerings: true },
    });
    await fanoutNotification({
      userIds: [updated.userId], managerRoles: notificationManagers,
      type: `teacher_application_${status}`, title: `Teacher application ${status}`, body: `Your teacher application has been ${status}.`,
      entityId: updated.id, eventKey: `teacher_review:${updated.id}:${updated.updatedAt.toISOString()}`,
    }, transaction);
    return updated;
  });

  return res.status(200).json({
    message:
      status === teacherApprovalStatuses.APPROVED
        ? messages.teacher.approved
        : messages.teacher.rejected,
    success: true,
    data: formatTeacherProfile(updatedApplication),
  });
};

// List approved teachers for public discovery.
export const getPublicTeachers = async (req, res) => {
  const { page, limit } = req.validatedQuery;
  const skip = (page - 1) * limit;
  const where = {
    approvalStatus: teacherApprovalStatuses.APPROVED,
    user: { is: { roles: roles.TEACHER, status: userStatuses.ACTIVE } },
  };
  const [teachers, total] = await Promise.all([
    TeacherProfile.findMany({
      where,
      select: {
        id: true,
        userId: true,
        bio: true,
        profileImage: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
        offerings: {
          where: {
            track: { is: { isActive: true } },
            subject: { is: { isActive: true } },
          },
          include: {
            track: { select: { id: true, system: true, stage: true, grade: true, name: true } },
            subject: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    TeacherProfile.count({ where }),
  ]);
  const data = teachers.map(({ user, ...profile }) =>
    formatTeacherProfile({ ...profile, userId: user }, true)
  );

  return res.status(200).json({
    message: messages.teacher.fetchedSuccessfully,
    success: true,
    count: total,
    data,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// Get one approved teacher's public profile by user ID.
export const getPublicTeacherProfile = async (req, res, next) => {
  const profile = await TeacherProfile.findFirst({
    where: {
      userId: req.validatedParams.teacherId,
      approvalStatus: teacherApprovalStatuses.APPROVED,
      user: { is: { roles: roles.TEACHER, status: userStatuses.ACTIVE } },
    },
    select: {
      id: true,
      userId: true,
      bio: true,
      profileImage: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
      offerings: {
        where: {
          track: { is: { isActive: true } },
          subject: { is: { isActive: true } },
        },
        include: {
          track: { select: { id: true, system: true, stage: true, grade: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!profile) {
    return next(new AppError(messages.teacher.profileNotFound, 404));
  }

  const { user, ...profileData } = profile;
  return res.status(200).json({
    message: messages.teacher.fetchedSuccessfully,
    success: true,
    data: formatTeacherProfile({ ...profileData, userId: user }, true),
  });
};
