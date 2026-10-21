import { NextRequest } from "next/server";
import { getFreshReleases } from "@apis/youtubei.js";

export const maxDuration = 30;

// GET /api/releases/check?artists=UCxxx,UCyyy&maxAgeHours=36
// Returns only releases whose REAL YouTube publish date is inside the window.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const artists = (sp.get("artists") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);

  const maxAgeHours = Math.min(
    168,
    Math.max(12, parseInt(sp.get("maxAgeHours") || "36") || 36)
  );

  if (artists.length === 0) {
    return Response.json({ releases: [] });
  }

  const per = await Promise.allSettled(
    artists.map(async (id) => ({ id, releases: await getFreshReleases(id, maxAgeHours) }))
  );

  const releases = per.flatMap((p) =>
    p.status === "fulfilled"
      ? p.value.releases.map((r) => ({ ...r, artistId: p.value.id }))
      : []
  );
  releases.sort((a: any, b: any) => b.publishedAt - a.publishedAt);

  return Response.json({ releases, maxAgeHours });
}
