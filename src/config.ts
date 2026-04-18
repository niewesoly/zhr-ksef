import { z } from "zod";

const base64With32Bytes = z
  .string()
  .min(1, "ENCRYPTION_KEY is required")
  .refine(
    (value) => {
      try {
        return Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    },
    { message: "ENCRYPTION_KEY must be base64-encoded 32 bytes" },
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: base64With32Bytes,
  // Shared secret used to guard tenant provisioning endpoints. Presented
  // in the `X-Admin-Key` header. Set to a long random value in prod.
  ADMIN_API_KEY: z.string().min(24, "ADMIN_API_KEY must be at least 24 characters"),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const flat = parsed.error.flatten().fieldErrors;
  console.error("Invalid environment configuration:");
  for (const [key, messages] of Object.entries(flat)) {
    if (messages) console.error(`  ${key}: ${messages.join(", ")}`);
  }
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  encryptionKey: Buffer.from(parsed.data.ENCRYPTION_KEY, "base64"),
};

export type Config = typeof config;
