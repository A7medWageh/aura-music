import { NextRequest } from "next/server";
import { query } from "@apis/neon";
import { ok, fail } from "@/services/http/response";

const DURATION_LABELS: Record<string, string> = {
  "1m": "شهر واحد",
  "3m": "3 شهور",
  "6m": "6 شهور",
  "1y": "سنة كاملة",
  "lifetime": "مدى الحياة",
};

function getDurationMs(duration: string): number | null {
  switch (duration) {
    case "1m": return 30 * 24 * 60 * 60 * 1000;
    case "3m": return 90 * 24 * 60 * 60 * 1000;
    case "6m": return 180 * 24 * 60 * 60 * 1000;
    case "1y": return 365 * 24 * 60 * 60 * 1000;
    case "lifetime": return null;
    default: return 90 * 24 * 60 * 60 * 1000;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim().toLowerCase();
    const list = searchParams.get("list");

    if (list === "true") {
      const res = await query(
        `SELECT email, duration, duration_label, granted_at, expires_at 
         FROM granted_subscriptions 
         ORDER BY granted_at DESC 
         LIMIT 50`
      );
      return ok({ subscriptions: res.rows });
    }

    if (!email) {
      return fail("BAD_REQUEST", "Missing email parameter", 400);
    }

    const res = await query(
      `SELECT email, duration, duration_label, granted_at, expires_at 
       FROM granted_subscriptions 
       WHERE email = $1`,
      [email]
    );

    if (res.rows.length === 0) {
      return ok({ hasGrant: false });
    }

    const sub = res.rows[0];
    if (sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) {
      return ok({ hasGrant: false, expired: true });
    }

    return ok({ hasGrant: true, subscription: sub });
  } catch (err: any) {
    return fail("DB_ERROR", err.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const duration = String(body.duration || "1y").toLowerCase();

    if (!email || !email.includes("@")) {
      return fail("BAD_REQUEST", "يرجى كتابة بريد إلكتروني صحيح", 400);
    }

    const durationLabel = DURATION_LABELS[duration] || duration;
    const durationMs = getDurationMs(duration);
    const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;

    // 1. Insert or update granted_subscriptions table
    await query(
      `INSERT INTO granted_subscriptions (email, duration, duration_label, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE 
       SET duration = EXCLUDED.duration, 
           duration_label = EXCLUDED.duration_label, 
           expires_at = EXCLUDED.expires_at, 
           granted_at = NOW()`,
      [email, duration, durationLabel, expiresAt]
    );

    // 2. Also upgrade the user in users table if they are registered
    await query(
      `UPDATE users SET tier = 'premium' WHERE email = $1`,
      [email]
    ).catch(() => {});

    return ok({
      success: true,
      email,
      duration,
      durationLabel,
      expiresAt,
      message: `تم منح وتفعيل اشتراك VIP (${durationLabel}) للحساب ${email} بنجاح!`,
    });
  } catch (err: any) {
    console.error("[api/subscription/grant] Error:", err);
    return fail("INTERNAL_ERROR", err.message || "فشل منح الاشتراك", 500);
  }
}
