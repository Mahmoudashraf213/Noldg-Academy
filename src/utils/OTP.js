import { customAlphabet } from "nanoid";
import { sendEmail } from "./sendEmail.js";
import { messages } from "./constant/messages.js";

// Generate a six-digit numeric one-time password.
export const generateOTP = customAlphabet("0123456789", 6);

// Deliver an OTP to the user's email address.
export const sendOTP = async (email, otp) => {
  await sendEmail({
    to: email,
    subject: messages.email.otpSubject,
    html: messages.email.otpHtml(otp),
  });
};
