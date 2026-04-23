import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// ── Persistence strategy ──────────────────────────────────────────────────────
// We store liked song IDs in a cookie (httpOnly=false so JS can read it too).
// This survives server restarts and page reloads without needing a database.
// The cookie holds a JSON array of song IDs (up to ~4 KB = ~100 IDs).
//
// Additionally, song metadata (title, artist, thumbnail) is stored client-side
// in localStorage by the FavoritesStore utility so the favorites page can
// display full song info after reload.

const LIKES_COOKIE = "aura_likes";

function parseLikes(cookieValue: string | undefined): Set<string> {
  if (!cookieValue) return new Set();
  try {
    const arr = JSON.parse(decodeURIComponent(cookieValue));
    if (Array.isArray(arr)) return new Set(arr as string[]);
  } catch {}
  return new Set();
}

function serializeLikes(set: Set<string>): string {
  return encodeURIComponent(JSON.stringify(Array.from(set)));
}

export async function POST(req: NextRequest) {
  try {
    const { songId } = await req.json();
    if (!songId || typeof songId !== "string") {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const cookieStore = await cookies();
    const raw = cookieStore.get(LIKES_COOKIE)?.value;
    const liked = parseLikes(raw);

    const wasLiked = liked.has(songId);
    if (wasLiked) {
      liked.delete(songId);
    } else {
      liked.add(songId);
    }

    const res = NextResponse.json({ success: true, liked: !wasLiked });
    res.cookies.set(LIKES_COOKIE, serializeLikes(liked), {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: false,             // readable by JS for client-side use
      sameSite: "lax",
    });
    return res;
  } catch {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const songId = searchParams.get("songId");

    const cookieStore = await cookies();
    const raw = cookieStore.get(LIKES_COOKIE)?.value;
    const liked = parseLikes(raw);

    if (songId) {
      return NextResponse.json({ liked: liked.has(songId) });
    }

    // Return all liked IDs
    return NextResponse.json({ songs: Array.from(liked) });
  } catch {
    return NextResponse.json({ liked: false });
  }
}
