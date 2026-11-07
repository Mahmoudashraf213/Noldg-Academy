import { prisma } from "../../../db/index.js";
import { messages } from "../../utils/constant/messages.js";
import { roles } from "../../utils/constant/enum.js";
import { fanoutNotification } from "../notification/notification.utils.js";

const publicSettingsSelect = {
  platformName: true,
  supportEmail: true,
  supportPhone: true,
  socialLinks: true,
  paymentInstructions: true,
};

// Reuse the platform singleton without exposing commission or infrastructure settings.
export const getSettings = async (req, res) => {
  const settings = await prisma.platformSettings.upsert({
    where: { settingsKey: "platform" },
    update: {},
    create: { id: "platform", settingsKey: "platform" },
    select: publicSettingsSelect,
  });
  return res.status(200).json({ message: messages.settings.fetchedSuccessfully, success: true, data: settings });
};

export const updateSettings = async (req, res) => {
  const settings = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.platformSettings.findUnique({ where: { settingsKey: "platform" } });
    const unchanged = existing && Object.entries(req.body).every(([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value));
    const saved = await transaction.platformSettings.upsert({
      where: { settingsKey: "platform" },
      update: req.body,
      create: { id: "platform", settingsKey: "platform", ...req.body },
    });
    if (!unchanged) await fanoutNotification({
      managerRoles: [roles.SUPER_ADMIN], type: "settings_updated", title: "Platform settings updated",
      body: Object.keys(req.body).join(", "), entityId: saved.id,
      eventKey: `settings_updated:${saved.updatedAt.toISOString()}`,
    }, transaction);
    return Object.fromEntries(Object.keys(publicSettingsSelect).map((key) => [key, saved[key]]));
  }, { maxWait: 15000, timeout: 60000 });
  return res.status(200).json({ message: messages.settings.updated, success: true, data: settings });
};
