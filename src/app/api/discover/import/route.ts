import { NextRequest } from "next/server";
import { searchYouTube } from "@apis/youtubei.js";
import { ingestYouTubeItems } from "@/services/music/ingestYouTube";
import { requireAuth } from "@/services/security/authorize";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail, ok } from "@/services/http/response";

export async function POST(req: NextRequest) {
  // const auth = await requireAuth(req);
  // if (!auth) return fail("UNAUTHORIZED", "unauthorized", 401);

  const rate = await checkRateLimit(req, { key: "discover-import", max: 6, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  const keywords = [
    "Amr Diab Official Audio",
    "Mohamed Hamaki Albums",
    "Wegz - ويجز",
    "Marwan Pablo - مروان بابلو",
    "Cairokee - كايروكي",
    "Tamer Hosny Official",
    "Sherine Abdel Wahab",
    "Angham - أنغام",
    "Hassan Shakosh - حسن شاكوش",
    "Tamer Ashour - تامر عاشور",
    "Wael Jassar",
    "Nancy Ajram",
    "Ruby - روبي",
    "Ahmed Saad - احمد سعد"
  ];

  const batches = await Promise.all(keywords.map((q) => searchYouTube(q)));
  const merged = batches.flatMap((batch) => batch.items);
  await ingestYouTubeItems(merged);

  return ok({ imported: merged.length });
}
