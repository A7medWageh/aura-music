import { NextResponse } from "next/server";

export async function GET() {
  // Railway healthcheck — just confirm the process is alive.
  // Individual service checks are informational only and never cause 5xx.
  let dbOk = false;
  let redisOk = false;

  try {
    const { query } = await import("../../../../apis/neon");
    await query("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }

  try {
    const { getRedisClient } = await import("../../../../apis/redis");
    const client = getRedisClient();
    await (client as any).ping?.();
    redisOk = true;
  } catch {
    redisOk = false;
  }

  // Always return 200 — app is running regardless of optional service status
  return NextResponse.json({
    ok: true,
    service: "music-web-platform",
    checks: {
      db: { ok: dbOk },
      redis: { ok: redisOk, optional: true },
    },
  });
}

