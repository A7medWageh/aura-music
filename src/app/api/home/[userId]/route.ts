import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { query } from "@apis/neon";
import { getUserFromRequest } from "@/services/auth/session";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";

type Params = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const rate = await checkRateLimit(req, { key: "home-feed", max: 80, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);
  const auth = await getUserFromRequest(req);
  if (!auth) {
    return fail("UNAUTHORIZED", "unauthorized", 401);
  }

  const { userId } = await params;
  if (auth.sub !== userId) {
    return fail("FORBIDDEN", "forbidden", 403);
  }

  const [preferencesResult, recommendationsResult, recentResult] = await Promise.all([
    query<{ favorite_artists: unknown; moods: unknown }>(
      `SELECT favorite_artists, moods FROM user_preferences WHERE user_id = $1`,
      [userId]
    ),
    query<{
      song_id: string;
      score: number;
      title: string;
      youtube_video_id: string;
      artist_name: string;
      artist_image_url: string | null;
      album_cover_url: string | null;
    }>(
      `
        SELECT r.song_id, r.score, s.title, s.youtube_video_id, a.name AS artist_name,
               a.image_url AS artist_image_url, al.cover_url AS album_cover_url
        FROM recommendations r
        JOIN songs s ON s.id = r.song_id
        JOIN artists a ON a.id = s.artist_id
        LEFT JOIN albums al ON al.id = s.album_id
        WHERE r.user_id = $1
        ORDER BY r.score DESC
        LIMIT 12
      `,
      [userId]
    ),
    query<{
      song_id: string;
      played_at: string;
      title: string;
      youtube_video_id: string;
      artist_name: string;
      artist_image_url: string | null;
      album_cover_url: string | null;
    }>(
      `
        SELECT h.song_id, h.played_at, s.title, s.youtube_video_id, a.name AS artist_name,
               a.image_url AS artist_image_url, al.cover_url AS album_cover_url
        FROM history h
        JOIN songs s ON s.id = h.song_id
        JOIN artists a ON a.id = s.artist_id
        LEFT JOIN albums al ON al.id = s.album_id
        WHERE h.user_id = $1
        ORDER BY h.played_at DESC
        LIMIT 12
      `,
      [userId]
    )
  ]);

  const preferences = preferencesResult.rows[0] ?? { favorite_artists: [], moods: [] };

  return NextResponse.json({
    data: {
      preferences,
      recommended: recommendationsResult.rows,
      recent: recentResult.rows
    }
  });
}
