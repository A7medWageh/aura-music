import { NextRequest } from "next/server";
import { query } from "@apis/neon";
import { requireAuth } from "@/services/security/authorize";
import { assertCsrf } from "@/services/security/csrf";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail, ok } from "@/services/http/response";

type OfflineItem = {
  userId: string;
  songId: string;
  cacheKey: string;
  byteSize: number;
};

export async function POST(req: NextRequest) {
  const rate = await checkRateLimit(req, { key: "offline-sync", max: 60, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  const auth = await requireAuth(req);
  if (!auth) return fail("UNAUTHORIZED", "unauthorized", 401);
  const csrfOk = await assertCsrf(req);
  if (!csrfOk) return fail("CSRF_INVALID", "Missing or invalid CSRF token", 403);

  const body = (await req.json()) as { items?: OfflineItem[] };
  const items = (body.items ?? []).filter((item) => item.userId === auth.sub);

  if (!items.length) {
    return ok({ synced: 0 });
  }

  await Promise.all(
    items.map((item) =>
      query(
        `
          INSERT INTO offline_cache (user_id, song_id, cache_key, byte_size, synced_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (user_id, song_id)
          DO UPDATE
          SET cache_key = EXCLUDED.cache_key,
              byte_size = EXCLUDED.byte_size,
              synced_at = NOW()
        `,
        [item.userId, item.songId, item.cacheKey, item.byteSize]
      )
    )
  );

  return ok({ synced: items.length });
}
