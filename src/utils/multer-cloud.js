// import module
import multer, { diskStorage } from "multer";
import { randomBytes } from "crypto";
import { createWriteStream, unlink } from "fs";
import { tmpdir } from "os";
import path from "path";
import { pipeline, Transform } from "stream";
import { fileValidation } from "./multer.js";
import { AppError } from "./appError.js";
import { messages } from "./constant/messages.js";

// Bound individual attachments and the combined multipart payload while streaming to disk.
const lessonStorage = {
  _handleFile(req, file, callback) {
    const destination = tmpdir();
    const filename = randomBytes(16).toString("hex");
    const filePath = path.join(destination, filename);
    let size = 0;
    const maximum = (file.fieldname === "video" ? 256 : 25) * 1024 * 1024;
    const meter = new Transform({
      transform(chunk, encoding, next) {
        size += chunk.length;
        req.lessonUploadBytes = (req.lessonUploadBytes || 0) + chunk.length;
        if (size > maximum || req.lessonUploadBytes > 500 * 1024 * 1024) return next(new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname));
        next(null, chunk);
      },
    });
    pipeline(file.stream, meter, createWriteStream(filePath, { flags: "wx" }), (error) => {
      if (error) return unlink(filePath, () => callback(error));
      callback(null, { destination, filename, path: filePath, size });
    });
  },
  _removeFile(req, file, callback) {
    unlink(file.path, (error) => callback(error?.code === "ENOENT" ? null : error));
  },
};


// Configure Multer to accept the selected file types before cloud processing.
export const cloudUploads = ({  allowFile = fileValidation.image }= {}) => {
  const storage = diskStorage({});

  // Reject uploads whose MIME type is outside the allowlist.
  const fileFilter = (req, file, cb) => {
    if (allowFile.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new AppError(messages.upload.invalidFileType, 400), false);
  };

  return multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20, parts: 21, fieldSize: 64 * 1024 } });
};

// Accept one lesson video and PDF attachments in separate multipart fields.
export const lessonUploads = () => {
  const storage = lessonStorage;
  const fileFilter = (req, file, cb) => {
    const allowedFiles =
      file.fieldname === "video"
        ? fileValidation.lessonVideo
        : file.fieldname === "attachments"
          ? fileValidation.lessonAttachment
          : [];

    if (allowedFiles.includes(file.mimetype)) {
      return cb(null, true);
    }

    return cb(new AppError(messages.upload.invalidFileType, 400), false);
  };

  return multer({ storage, fileFilter, limits: { fileSize: 256 * 1024 * 1024, files: 11, fields: 20, parts: 31, fieldSize: 64 * 1024 } }).fields([
    { name: "video", maxCount: 1 },
    { name: "attachments", maxCount: 10 },
  ]);
};
