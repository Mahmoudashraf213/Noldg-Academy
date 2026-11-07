import path from "path";
import { v2 as cloudinary } from "cloudinary" ;
import dotenv from "dotenv";
dotenv.config({ path: path.resolve("./config/.env"), quiet: true });

// Configure Cloudinary with the project credentials.
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});
export default cloudinary;

// Delete an uploaded image by its Cloudinary public ID.
export const deleteCloudImage = async (public_id) => {
  await cloudinary.uploader.destroy(public_id, { timeout: 10000 });
};
