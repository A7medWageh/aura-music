import Redis from "ioredis";
import { getEnv } from "@/services/config/env";

let redisClient: Redis | null = null;

export function getRedisClient() {
  if (redisClient) return redisClient;
  const env = getEnv();

  redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false
  });
  redisClient.on("error", () => undefined);

  return redisClient;
}
