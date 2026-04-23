import { getRedisClient } from "@apis/redis";

export async function getCachedRecommendations(userId: string) {
  const client = getRedisClient();
  await client.connect().catch(() => undefined);
  const data = await client.get(`reco:${userId}`);
  return data ? JSON.parse(data) : null;
}

export async function setCachedRecommendations(userId: string, recommendations: unknown[]) {
  const client = getRedisClient();
  await client.connect().catch(() => undefined);
  await client.set(`reco:${userId}`, JSON.stringify(recommendations), "EX", 300);
}
