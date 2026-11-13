import { NextRequest } from "next/server";
import { query } from "@apis/neon";
import { fail, ok } from "@/services/http/response";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const tier = String(body.tier ?? "").trim().toLowerCase();

    if (!email || !["premium", "free"].includes(tier)) {
      return fail("BAD_REQUEST", "Invalid email or tier", 400);
    }

    // 1. Update or create user in users table
    const result = await query(
      `INSERT INTO users (email, display_name, tier, role) 
       VALUES ($1, $2, $3, 'user')
       ON CONFLICT (email) DO UPDATE SET tier = EXCLUDED.tier 
       RETURNING id, email, display_name, tier`,
      [email, email.split("@")[0], tier]
    );

    // 2. Also sync to granted_subscriptions table
    if (tier === "premium") {
      await query(
        `INSERT INTO granted_subscriptions (email, duration, duration_label)
         VALUES ($1, 'lifetime', 'مدى الحياة')
         ON CONFLICT (email) DO UPDATE SET duration = 'lifetime', duration_label = 'مدى الحياة', granted_at = NOW()`,
        [email]
      ).catch(() => {});
    } else {
      await query(
        `DELETE FROM granted_subscriptions WHERE email = $1`,
        [email]
      ).catch(() => {});
    }

    return ok({ user: result.rows[0] });
  } catch (err: any) {
    return fail("INTERNAL_ERROR", err.message || "Failed to update user tier", 500);
  }
}
