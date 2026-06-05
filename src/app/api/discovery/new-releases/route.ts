import { NextResponse } from "next/server";
import { getNewReleases } from "@apis/youtubei.js";

let releasesCache: { data: any[]; ts: number } | null = null;
const RELEASES_TTL = 15 * 60 * 1000; // 15 min


export async function GET(req: Request) {

  if (releasesCache && Date.now() - releasesCache.ts < RELEASES_TTL) {
    return NextResponse.json(
      { success: true, data: releasesCache.data },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  }

  try {
    const releases = await getNewReleases();

    releasesCache = { data: releases, ts: Date.now() };

    return NextResponse.json(
      { success: true, data: releases },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch (error: any) {
    console.error("[New Releases] Error:", error.message);

    if (releasesCache) {
      return NextResponse.json({ success: true, data: releasesCache.data, stale: true });
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch new releases", details: error.message },
      { status: 500 }
    );
  }
}
