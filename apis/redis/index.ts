import Redis from "ioredis";

let redisClient: Redis | null = null;
let redisAvailable = true;

// A no-op Redis client that silently ignores all operations
const noopRedis = new Proxy({} as Redis, {
  get: () => () => Promise.resolve(null),
});

export function getRedisClient(): Redis {
  // If we already know Redis is unavailable, return noop immediately
  if (!redisAvailable) return noopRedis;
  
  if (redisClient) return redisClient;

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = parseInt(process.env.REDIS_PORT || "6379");
  const password = process.env.REDIS_PASSWORD || undefined;

  // On Vercel/production without Redis, return noop immediately
  const isLocalhost = host === "127.0.0.1" || host === "localhost";
  const isVercel = process.env.VERCEL === "1" || process.env.VERCEL_ENV !== undefined;
  
  if (isLocalhost && isVercel) {
    console.log("[Redis] Localhost Redis not available on Vercel — running without cache");
    redisAvailable = false;
    return noopRedis;
  }

  redisClient = new Redis({
    host,
    port,
    password,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 2000,
    commandTimeout: 1500,
  });

  redisClient.on("error", (err) => {
    if (!err.message?.includes("ECONNREFUSED") === false) {
      // Connection refused — Redis not running, disable it
      redisAvailable = false;
      redisClient = null;
    }
  });

  return redisClient;
}
