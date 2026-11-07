import jwt from "jsonwebtoken";
import { messages } from "./constant/messages.js";

// Sign a JWT with the configured secret and expiry.
export const generateToken = ({
  payload,
  secretKey = process.env.SECRET_KEY,
  expiresIn = process.env.ACCESS_TOKEN_TTL || "5h",
}) => {
  if (!secretKey) {
    throw new Error(messages.auth.secretMissing);
  }

  const options = expiresIn === "none" ? {} : { expiresIn };
  return jwt.sign(payload, secretKey, options);
};

// Return the decoded payload, or a centralized error message if verification fails.
export const verifyToken = (token, secretKey = process.env.SECRET_KEY) => {
  try {
    if (!secretKey) {
      throw new Error(messages.auth.secretMissing);
    }

    return jwt.verify(token, secretKey);
  } catch {
    return { message: messages.auth.invalidToken };
  }
};
