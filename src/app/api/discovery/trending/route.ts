import { NextResponse } from "next/server";
import { getMusicCharts } from "@apis/youtubei.js";

// In-process cache — avoids calling YouTube every request
let chartCache: { data: any[]; ts: number } | null = null;
const CHART_TTL = 10 * 60 * 1000; // 10 min

export async function GET() {
  // Return cached data instantly
  if (chartCache && Date.now() - chartCache.ts < CHART_TTL) {
    return NextResponse.json(
      { success: true, data: chartCache.data },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  }

  try {
    const charts = await getMusicCharts();
    chartCache = { data: charts, ts: Date.now() };
    return NextResponse.json(
      { success: true, data: charts },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch (error: any) {
    console.error("Charts API Error:", error);
    // Return stale cache if available
    if (chartCache) {
      return NextResponse.json(
        { success: true, data: chartCache.data, stale: true },
        { headers: { "Cache-Control": "public, s-maxage=60" } }
      );
    }
    return NextResponse.json(
      { success: false, error: "Failed to fetch charts", details: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
