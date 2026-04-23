import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_NAME: z.string().default("MusicWeb"),
  NEON_DB_HOST: z.string().min(1),
  NEON_DB_PORT: z.coerce.number().int().positive().default(5432),
  NEON_DB_USERNAME: z.string().min(1),
  NEON_DB_PASSWORD: z.string().min(1),
  NEON_DB_NAME: z.string().default("neondb"),
  NEON_DB_SSL: z.string().default("true"),
  NEON_DB_POOL_MAX: z.coerce.number().int().positive().default(15),
  NEON_DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  YT_DLP_PATH: z.string().default("yt-dlp"),
  AUTH_JWT_SECRET: z.string().min(32),
  AUTH_CSRF_SECRET: z.string().min(16).default("change-me-csrf-secret"),
  RATE_LIMIT_WINDOW_SEC: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100)
});

let cachedEnv: z.infer<typeof envSchema> | null = null;

export function getEnv() {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}
