import { unlink } from "fs/promises";
import { messages } from "../utils/constant/messages.js";

// Clean temporary uploads even when validation or ownership checks reject the request.
export const cleanupRequestUploads = (req, res, next) => {
  let scheduled = false;
  const cleanup = () => {
    if (scheduled) return;
    scheduled = true;
    const files = [req.file, ...Object.values(req.files ?? {}).flat()].filter(Boolean);
    for (const file of files) {
      unlink(file.path).catch((error) => {
        if (error.code !== "ENOENT") console.error(messages.error.cleanupFailed, error.code);
      });
    }
  };
  res.once("finish", cleanup);
  res.once("close", cleanup);
  next();
};
