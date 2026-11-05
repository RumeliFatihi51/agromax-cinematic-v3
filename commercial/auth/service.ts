import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Store } from "../db/store";
import * as schema from "../db/schema";
const scryptAsync = promisify(scrypt);
export interface TransactionalMail {
  deliver(message: {
    to: string;
    subject: string;
    text: string;
    kind: "verification" | "password_reset";
  }): Promise<void>;
}
export async function verifyMigratedPassword(input: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const legacy = input.hash.match(
    /^legacy-scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/,
  );
  if (!legacy) return verifyPassword(input);
  const actual = (await scryptAsync(input.password, legacy[1]!, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(legacy[2]!, "hex"));
}
export function createIdentity(
  store: Store,
  options: {
    baseURL: string;
    secret: string;
    mail?: TransactionalMail;
    rateLimit?: boolean;
  },
) {
  if (options.secret.length < 32)
    throw new Error(
      "Authentication secret must contain at least 32 characters.",
    );
  const requireMail = async (
    to: string,
    subject: string,
    text: string,
    kind: "verification" | "password_reset",
  ) => {
    if (!options.mail)
      throw new Error("Transactional email is not configured.");
    await options.mail.deliver({ to, subject, text, kind });
  };
  const auth = betterAuth({
    appName: "Agromax",
    baseURL: options.baseURL,
    secret: options.secret,
    basePath: "/api/auth",
    trustedOrigins: [options.baseURL],
    database: drizzleAdapter(store.db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyMigratedPassword },
      sendResetPassword: async ({ user, url }) =>
        requireMail(
          user.email,
          "Agromax · Şifre sıfırlama",
          `Şifrenizi sıfırlamak için: ${url}\nBu işlemi siz başlatmadıysanız bağlantıyı kullanmayın.`,
          "password_reset",
        ),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        requireMail(
          user.email,
          "Agromax · E-posta doğrulama",
          `E-posta adresinizi doğrulamak için: ${url}`,
          "verification",
        ),
    },
    session: {
      expiresIn: 86400 * 7,
      updateAge: 3600,
      freshAge: 600,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: options.rateLimit ?? true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 30,
    },
    user: { changeEmail: { enabled: true }, deleteUser: { enabled: false } },
    advanced: {
      useSecureCookies: options.baseURL.startsWith("https://"),
      database: { generateId: () => crypto.randomUUID().replaceAll("-", "") },
    },
    logger: { disabled: true },
  });
  return { auth, mailConfigured: !!options.mail };
}
