import path from "path";
import { randomBytes } from "crypto";
import cloudinary from "../../utils/cloud.js";
import { generateToken, verifyToken } from "../../utils/token.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { uploadLessonMedia } from "./lesson.utils.js";

// Issue a course-scoped ticket and sign only server-selected upload parameters.
export const createLessonUpload = ({ teacherId, courseId, kind, name }) => {
  const resourceType = kind === "video" ? "video" : "raw";
  const extension = path.extname(name).slice(1).toLowerCase();
  const publicId = `noldg_academy/lessons/direct/${teacherId}/${courseId}/${randomBytes(16).toString("hex")}${resourceType === "raw" ? `.${extension}` : ""}`;
  const params = {
    timestamp: Math.floor(Date.now() / 1000),
    public_id: publicId,
    type: "authenticated",
    overwrite: false,
    ...(resourceType === "video" && { allowed_formats: "mp4,webm,mov" }),
  };
  const uploadToken = generateToken({
    payload: { tokenType: "lesson_upload", teacherId, courseId, kind, name, publicId },
    expiresIn: "1h",
  });

  return {
    url: `https://api.cloudinary.com/v1_1/${process.env.CLOUD_NAME}/${resourceType}/upload`,
    fields: { ...params, api_key: process.env.API_KEY, signature: cloudinary.utils.api_sign_request(params, process.env.API_SECRET) },
    uploadToken,
    maxBytes: (kind === "video" ? 256 : 25) * 1024 * 1024,
  };
};

// Fetch provider metadata instead of accepting client-supplied URLs or asset details.
export const resolveLessonUpload = async (token, { teacherId, courseId, kind }) => {
  const payload = verifyToken(token);
  if (payload.tokenType !== "lesson_upload" || payload.teacherId !== teacherId || payload.courseId !== courseId || payload.kind !== kind) {
    throw new AppError(messages.error.invalidRequest, 400);
  }
  const resourceType = kind === "video" ? "video" : "raw";
  let resource;
  try {
    resource = await cloudinary.api.resource(payload.publicId, { resource_type: resourceType, type: "authenticated", timeout: 10000 });
  } catch (error) {
    if (error.http_code === 404) throw new AppError(messages.error.invalidRequest, 400);
    throw error;
  }
  if (resource.public_id !== payload.publicId || resource.resource_type !== resourceType || resource.type !== "authenticated"
    || !Number.isFinite(resource.bytes) || resource.bytes <= 0 || resource.bytes > (kind === "video" ? 256 : 25) * 1024 * 1024
    || (kind === "video" && !["mp4", "webm", "mov"].includes(resource.format))) {
    throw new AppError(messages.error.invalidRequest, 400);
  }
  return kind === "video"
    ? { publicId: resource.public_id, format: resource.format, ...(Number.isFinite(resource.duration) && { duration: resource.duration }) }
    : { publicId: resource.public_id, name: payload.name, format: path.extname(payload.name).slice(1).toLowerCase() };
};

// Support direct JSON uploads alongside the existing multipart flow.
export const prepareLessonMedia = async (files = {}, body, scope) => {
  if ((body.videoUploadToken && files.video?.length) || (body.attachmentUploadTokens?.length || 0) + (files.attachments?.length || 0) > 10) {
    throw new AppError(messages.error.invalidRequest, 400);
  }
  const directAssets = [];
  let video;
  if (body.videoUploadToken) {
    video = await resolveLessonUpload(body.videoUploadToken, { ...scope, kind: "video" });
    directAssets.push(video);
  }
  const attachments = [];
  for (const token of body.attachmentUploadTokens || []) {
    const asset = await resolveLessonUpload(token, { ...scope, kind: "attachment" });
    attachments.push(asset);
    directAssets.push(asset);
  }
  if (new Set(directAssets.map((asset) => asset.publicId)).size !== directAssets.length) {
    throw new AppError(messages.error.invalidRequest, 400);
  }
  const media = await uploadLessonMedia(files);
  return { ...media, video: video || media.video, attachments: [...media.attachments, ...attachments], directAssets };
};

// Serialize ticket consumption and reject assets already attached or queued for deletion.
export const assertLessonUploadsUnused = async (media, transaction) => {
  for (const asset of [...media.directAssets].sort((left, right) => left.publicId.localeCompare(right.publicId))) {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${asset.publicId}, 0))::text AS "lock"`;
    const used = await transaction.lesson.findFirst({ where: { OR: [
      { video: { path: ["publicId"], equals: asset.publicId } },
      { attachments: { array_contains: [{ publicId: asset.publicId }] } },
    ] }, select: { id: true } });
    const deleting = await transaction.mediaCleanupTask.findFirst({ where: { asset: { path: ["publicId"], equals: asset.publicId } }, select: { id: true } });
    if (used || deleting) throw new AppError(messages.error.invalidRequest, 400);
  }
};
