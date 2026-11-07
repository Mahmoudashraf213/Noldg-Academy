import fs from "fs";
import path from "path";

// Remove a file at the supplied path.
export const deleteFile = (filePath) => {
  let fullPath = path.resolve(filePath);
  try { fs.unlinkSync(fullPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
};
