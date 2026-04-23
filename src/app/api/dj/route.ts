import { NextRequest, NextResponse } from "next/server";
import { getMoodMix } from "@/../apis/youtubei.js";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mood = url.searchParams.get("mood");
  
  if (!mood) {
    return NextResponse.json({ success: false, error: "Missing mood parameter" }, { status: 400 });
  }

  try {
    const queue = await getMoodMix(mood);
    return NextResponse.json({ success: true, data: queue });
  } catch (error) {
    console.error("DJ API error:", error);
    return NextResponse.json({ success: false, error: "Failed to generate DJ queue" }, { status: 500 });
  }
}
