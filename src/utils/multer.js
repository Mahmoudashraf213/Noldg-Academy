// MIME types accepted by the image upload middleware.
export const fileValidation = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  lessonVideo: ["video/mp4", "video/webm", "video/quicktime"],
  lessonAttachment: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};
