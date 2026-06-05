import { NextRequest, NextResponse } from "next/server";
import { smartSearch } from "@/services/search/smartSearch";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";
import { log } from "@/services/http/logger";

import { checkTunnelRedirect } from "@/utils/tunnelProxy";

export async function GET(req: NextRequest) {
  const redirect = await checkTunnelRedirect(req);
  if (redirect) return redirect;

  const startedAt = Date.now();
  const rate = await checkRateLimit(req, { key: "search", max: 120, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);
  const q = req.nextUrl.searchParams.get("q");
  if (!q) {
    return fail("BAD_REQUEST", "Missing q", 400);
  }

  const data = await smartSearch(q);
  log("info", "search_query", { q, durationMs: Date.now() - startedAt });
  return NextResponse.json({ data }, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
    }
  });
}
