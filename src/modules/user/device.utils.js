import { createHash } from "crypto";

// Build a server-side device key from the detected IP address and user agent.
export const getClientDeviceInfo = (req) => {
  const ipAddress = req.ip || req.socket.remoteAddress || "unknown";
  const userAgent = req.get("user-agent") || "unknown";
  const deviceId = createHash("sha256")
    .update(`${ipAddress}|${userAgent}`)
    .digest("hex");

  return { deviceId, ipAddress, userAgent };
};

// Use one registered device per account unless the environment sets another limit.
export const getDeviceLimit = () => {
  const deviceLimit = Number.parseInt(process.env.MAX_DEVICES_PER_USER, 10);
  return Number.isInteger(deviceLimit) && deviceLimit > 0 ? deviceLimit : 1;
};

