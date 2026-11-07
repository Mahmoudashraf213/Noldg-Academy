import { AppError } from "./appError.js";
import { messages } from "./constant/messages.js";

export const assertWhatsAppResetConfigured = () => {
  const required = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_API_VERSION", "WHATSAPP_RESET_TEMPLATE", "WHATSAPP_TEMPLATE_LANGUAGE", "PASSWORD_RESET_SECRET"];
  if (process.env.WHATSAPP_ENABLED !== "true" || required.some((key) => !process.env[key]) || Buffer.byteLength(process.env.PASSWORD_RESET_SECRET || "") < 32 || !/^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION || "") || !/^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID || "")) {
    throw new AppError(messages.auth.whatsappUnavailable, 503);
  }
};

export const normalizeWhatsAppPhone = (phone) => {
  let digits = phone.replace(/[\s()-]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("0")) digits = `${process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "20"}${digits.slice(1)}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
};

// An approved Meta authentication template carries the same code in body and copy-code button.
export const sendWhatsAppResetCode = async (phone, code) => {
  assertWhatsAppResetConfigured();
  try {
    const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        messaging_product: "whatsapp", to: phone, type: "template",
        template: {
          name: process.env.WHATSAPP_RESET_TEMPLATE, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE },
          components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ],
        },
      }),
    });
    if (!response.ok) throw new Error(messages.auth.whatsappUnavailable);
    const result = await response.json();
    if (!result.messages?.[0]?.id) throw new Error(messages.auth.whatsappUnavailable);
  } catch {
    // Provider payloads may contain phone numbers or codes; never forward or log them.
    throw new AppError(messages.auth.whatsappUnavailable, 503);
  }
};
