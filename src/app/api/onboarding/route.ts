import { NextRequest } from "next/server";
import { query } from "../../../../apis/neon";
import { getUserFromRequest } from "@/services/auth/session";
import { assertCsrf } from "@/services/security/csrf";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail, ok } from "@/services/http/response";

export async function POST(req: NextRequest) {
  const rate = await checkRateLimit(req, { key: "onboarding-post", max: 30, windowSec: 60 });
  if (!rate.allowed) {
    return fail("RATE_LIMITED", "Too many requests", 429);
  }

  const auth = await getUserFromRequest(req);
  if (!auth) {
    return fail("UNAUTHORIZED", "unauthorized", 401);
  }
  const csrfOk = await assertCsrf(req);
  if (!csrfOk) {
    return fail("CSRF_INVALID", "Missing or invalid CSRF token", 403);
  }

  const body = await req.json();
  const { favoriteArtists, moods } = body;

  await query(
    `
      INSERT INTO user_preferences (user_id, favorite_artists, moods)
      VALUES ($1, $2::jsonb, $3::jsonb)
      ON CONFLICT (user_id)
      DO UPDATE SET favorite_artists = EXCLUDED.favorite_artists, moods = EXCLUDED.moods, updated_at = NOW()
    `,
    [auth.sub, JSON.stringify(favoriteArtists ?? []), JSON.stringify(moods ?? [])]
  );

  return ok({ saved: true });
}
