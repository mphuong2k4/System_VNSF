import { z } from "zod";

const schema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]),
  APP_BASE_URL: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_TIMEZONE: z.literal("Asia/Ho_Chi_Minh"),
  SUPPORTED_LOCALES: z.literal("vi-VN,en-US"),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  REDIS_URL: z.string().startsWith("redis"),
  SESSION_SECRET_CURRENT: z.string().min(32),
  SESSION_SECRET_PREVIOUS: z.string().min(32),
  FIELD_ENCRYPTION_KEY_BASE64: z.string().min(40),
  FIELD_HMAC_KEY_BASE64: z.string().min(40),
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_BUCKET: z.string().min(3),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(3),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(8),
  EMAIL_PROVIDER: z.enum(["smtp"]),
  EMAIL_FROM: z.string().email(),
  SMTP_URL: z.string().startsWith("smtp://"),
  CLAMAV_HOST: z.string().min(1).default("localhost"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
});
export type AppConfig = z.infer<typeof schema>;
export const loadConfig = (
  source: NodeJS.ProcessEnv = process.env,
): AppConfig => schema.parse(source);
export const REDACTED_KEYS =
  /password|secret|token|authorization|cookie|identity|account/i;
