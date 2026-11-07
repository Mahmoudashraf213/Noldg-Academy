import path from "path";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { prisma, User } from "./index.js";
import { dbConnection } from "./connection.js";
import { roles, userStatuses } from "../src/utils/constant/enum.js";
import { registerSchema } from "../src/modules/auth/auth.validation.js";
import { messages } from "../src/utils/constant/messages.js";

dotenv.config({ path: path.resolve("config/.env"), quiet: true });

// Create the first super admin only when explicitly enabled in the environment.
const createSuperAdmin = async () => {
  if (process.env.BOOTSTRAP_SUPER_ADMIN !== "true") {
    throw new Error(messages.setup.superAdminFlagRequired);
  }

  // Read initial account details from environment variables, never from a public route.
  const account = {
    name: process.env.SUPER_ADMIN_NAME,
    email: process.env.SUPER_ADMIN_EMAIL,
    phone: process.env.SUPER_ADMIN_PHONE,
    password: process.env.SUPER_ADMIN_PASSWORD,
  };
  const { error, value } = registerSchema.validate(account, { abortEarly: false });

  if (error) {
    throw new Error(messages.setup.invalidAccountData);
  }

  await dbConnection();

  // Keep the bootstrap operation limited to one initial super admin.
  const existingSuperAdmin = await User.findFirst({
    where: { roles: roles.SUPER_ADMIN },
    select: { id: true },
  });
  if (existingSuperAdmin) {
    throw new Error(messages.setup.superAdminExists);
  }

  const existingEmail = await User.findUnique({
    where: { email: value.email.toLowerCase() },
    select: { id: true },
  });
  if (existingEmail) {
    throw new Error(messages.setup.emailExists);
  }

  const password = await bcrypt.hash(value.password, 10);
  const user = await User.create({
    data: {
      ...value,
      email: value.email.toLowerCase(),
      password,
      roles: roles.SUPER_ADMIN,
      status: userStatuses.ACTIVE,
      isVerified: true,
    },
  });

  console.log(messages.setup.superAdminCreated(user.email));
};

try {
  await createSuperAdmin();
} catch (error) {
  console.error(messages.setup.failed, error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
