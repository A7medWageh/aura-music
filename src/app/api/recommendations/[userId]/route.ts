import { NextRequest, NextResponse } from "next/server";
import { getRecommendations, rebuildRecommendations } from "@/ai/recommendationEngine";
import {
  getCachedRecommendations,
  setCachedRecommendations
} from "@/services/cache/recommendationsCache";
import { requireAuth } from "@/services/security/authorize";
import { assertCsrf } from "@/services/security/csrf";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";

type Params = { params: Promise<{ userId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if (!auth) return fail("UNAUTHORIZED", "unauthorized", 401);
  const rate = await checkRateLimit(req, { key: "recommendations-post", max: 20, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);
  if (!(await assertCsrf(req))) return fail("CSRF_INVALID", "Missing or invalid CSRF token", 403);

  const { userId } = await params;
  if (auth.sub !== userId && auth.role !== "admin") return fail("FORBIDDEN", "forbidden", 403);
  await rebuildRecommendations(userId);
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await requireAuth(req);
  if (!auth) return fail("UNAUTHORIZED", "unauthorized", 401);
  const rate = await checkRateLimit(req, { key: "recommendations-get", max: 60, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  const { userId } = await params;
  if (auth.sub !== userId && auth.role !== "admin") return fail("FORBIDDEN", "forbidden", 403);
  const cached = await getCachedRecommendations(userId);
  if (cached) {
    return NextResponse.json({ data: cached, cached: true });
  }

  const data = await getRecommendations(userId);
  await setCachedRecommendations(userId, data);
  return NextResponse.json({ data });
}
