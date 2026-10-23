import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

// Cheap "is the background ingest finished?" poll for the player.
// Matched by the exact videoId the listener clicked, so a cached row can never
// hand back a different song.
export async function GET(req: NextRequest) {
  const videoId = new URL(req.url).searchParams.get("videoId") || "";
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ cached: false }, { status: 400, headers: NO_CACHE_HEADERS });
  }
  try {
    const { query } = await import("@apis/neon");
    const res = await query<{ file_id: string; title: string }>(
      `SELECT tg_file_id AS file_id, title FROM telegram_audio_cache
        WHERE video_id = $1 AND tg_file_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1`,
      [videoId]
    );
    const row = res.rows[0];
    if (!row?.file_id) {
      return NextResponse.json({ cached: false }, { headers: NO_CACHE_HEADERS });
    }
    return NextResponse.json(
      {
        cached: true,
        url: `/api/telegram/stream?fileId=${encodeURIComponent(row.file_id)}&title=${encodeURIComponent(row.title || "song")}`,
      },
      { headers: { ...NO_CACHE_HEADERS, "Access-Control-Allow-Origin": "*" } }
    );
  } catch (err: any) {
    return NextResponse.json({ cached: false, error: err.message }, { headers: NO_CACHE_HEADERS });
  }
}
