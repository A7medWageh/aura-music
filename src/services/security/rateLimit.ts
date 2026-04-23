import { NextRequest } from "next/server";
import { getEnv } from "@/services/config/env";
import { getRedisClient } from "../../../apis/redis";

const memoryStore = new Map<string, { count: number; resetAt: number }>();

type RateLimitConfig = {
  key: string;
  max?: number;
  windowSec?: number;
};

export async function checkRateLimit(req: NextRequest, config: RateLimitConfig) {
  const env = getEnv();
  const max = config.max ?? env.RATE_LIMIT_MAX_REQUESTS;
  const windowSec = config.windowSec ?? env.RATE_LIMIT_WINDOW_SEC;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const redisKey = `ratelimit:${config.key}:${ip}`;

  try {
    const redis = getRedisClient();
    await redis.connect().catch(() => undefined);
    const value = await redis.incr(redisKey);
    if (value === 1) {
      await redis.expire(redisKey, windowSec);
    }
    return { allowed: value <= max, remaining: Math.max(0, max - value) };
  } catch {
    return memoryRateLimit(redisKey, max, windowSec);
  }
}

export function memoryRateLimit(key: string, max: number, windowSec: number) {
  const now = Date.now();
  const current = memoryStore.get(key);
  if (!current || current.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, remaining: max - 1 };
  }
  current.count += 1;
  memoryStore.set(key, current);
  return { allowed: current.count <= max, remaining: Math.max(0, max - current.count) };
}
