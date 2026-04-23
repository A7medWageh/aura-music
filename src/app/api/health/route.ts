import { NextResponse } from "next/server";
import { query } from "../../../../apis/neon";
import { getRedisClient } from "../../../../apis/redis";

export async function GET() {
  const db = { ok: false as boolean };
  const redis = { ok: false as boolean };

  try {
    await query("SELECT 1");
    db.ok = true;
  } catch {
    db.ok = false;
  }

  try {
    const client = getRedisClient();
    await client.connect().catch(() => undefined);
    await client.ping();
    redis.ok = true;
  } catch {
    redis.ok = false;
  }

  const ok = db.ok && redis.ok;
  return NextResponse.json(
    {
      ok,
      service: "music-web-platform",
      checks: { db, redis }
    },
    { status: ok ? 200 : 503 }
  );
}
