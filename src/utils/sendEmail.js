import nodemailer from "nodemailer";
import { messages } from "./constant/messages.js";

// Send an HTML email using the configured Gmail account.
export const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
    throw new Error(messages.email.credentialsMissing);
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  await transporter.sendMail({
    to,
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    subject,
    html,
  });
};
