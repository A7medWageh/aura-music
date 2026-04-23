import { NextResponse } from "next/server";
import { getNewReleases } from "@/../apis/youtubei.js";

export async function GET() {
  try {
    const charts = await getNewReleases();
    return NextResponse.json({ success: true, data: charts });
  } catch (error) {
    console.error("New Releases API Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch new releases" }, { status: 500 });
  }
}
