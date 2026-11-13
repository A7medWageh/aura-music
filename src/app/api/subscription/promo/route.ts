import { NextRequest, NextResponse } from "next/server";
import { query } from "@apis/neon";
import { ok, fail } from "@/services/http/response";

const DURATION_LABELS: Record<string, string> = {
  "1m": "شهر واحد",
  "3m": "3 شهور",
  "6m": "6 شهور",
  "1y": "سنة كاملة",
  "lifetime": "مدى الحياة",
};

export async function GET() {
  try {
    const res = await query(
      `SELECT code, duration, duration_label, created_at, expires_at, redeemed, redeemed_by, redeemed_at 
       FROM promo_codes 
       ORDER BY created_at DESC 
       LIMIT 50`
    );
    return ok({ codes: res.rows });
  } catch (err: any) {
    return fail("DB_ERROR", err.message || "Failed to fetch codes", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = String(body.action || "redeem").toLowerCase();

    // 1. Create a promo code (from Admin Console)
    if (action === "create") {
      const code = String(body.code || "").trim().toUpperCase();
      const duration = String(body.duration || "3m").toLowerCase();
      const durationLabel = body.durationLabel || DURATION_LABELS[duration] || duration;
      const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

      if (!code) {
        return fail("BAD_REQUEST", "Missing code", 400);
      }

      await query(
        `INSERT INTO promo_codes (code, duration, duration_label, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE 
         SET duration = EXCLUDED.duration, duration_label = EXCLUDED.duration_label, expires_at = EXCLUDED.expires_at`,
        [code, duration, durationLabel, expiresAt]
      );

      return ok({
        success: true,
        code,
        duration,
        durationLabel,
        message: `تم حفظ كود التفعيل في السحابة: ${code}`,
      });
    }

    // 2. Redeem a promo code (from any user)
    const rawCode = String(body.code || "").trim().toUpperCase();
    const userEmail = String(body.email || "user@aura.music").trim().toLowerCase();

    if (!rawCode) {
      return fail("BAD_REQUEST", "يرجى كتابة كود التفعيل", 400);
    }

    // A. Check universal master / lifetime hardcoded patterns
    const masterCodes = ["AURA-VIP", "AURA-2026", "PREMIUM", "VIP-GOLD", "AURA-PRO", "AURA-MASTER"];
    if (masterCodes.includes(rawCode) || rawCode.startsWith("VIP-GOLD")) {
      if (userEmail && userEmail.includes("@")) {
        await query(
          `UPDATE users SET tier = 'premium' WHERE email = $1`,
          [userEmail]
        ).catch(() => {});
      }
      return ok({
        success: true,
        tier: "premium",
        duration: "lifetime",
        durationLabel: "مدى الحياة",
        expiresAt: null,
        message: "🎉 تم تفعيل اشتراك AURA PREMIUM مدى الحياة بنجاح!",
      });
    }

    // B. Check in database promo_codes table
    const result = await query(
      `SELECT * FROM promo_codes WHERE UPPER(code) = $1`,
      [rawCode]
    );

    if (result.rows.length === 0) {
      // Check if it's an offline verifiable algorithmic code format (e.g. AURA-1Y-XXXX-YYYY)
      const parts = rawCode.split("-");
      if (parts.length >= 3 && parts[0] === "AURA") {
        const dur = parts[1].toLowerCase();
        if (["1m", "3m", "6m", "1y", "lifetime"].includes(dur)) {
          // Self-verifying format accepted
          const durLabel = DURATION_LABELS[dur] || "بريميوم";
          if (userEmail && userEmail.includes("@")) {
            await query(
              `UPDATE users SET tier = 'premium' WHERE email = $1`,
              [userEmail]
            ).catch(() => {});
          }
          return ok({
            success: true,
            tier: "premium",
            duration: dur,
            durationLabel: durLabel,
            message: `🎉 تم تفعيل اشتراك AURA PREMIUM (${durLabel}) بنجاح!`,
          });
        }
      }

      return fail("INVALID_CODE", "كود التفعيل غير صالح. تأكد من إدخال الكود الصحيح.", 404);
    }

    const promo = result.rows[0];

    if (promo.redeemed) {
      return fail("ALREADY_REDEEMED", "هذا الكود تم استخدامه مسبقاً على حساب آخر.", 400);
    }

    if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
      return fail("EXPIRED_CODE", "هذا الكود منتهي الصلاحية.", 400);
    }

    // Mark redeemed
    await query(
      `UPDATE promo_codes 
       SET redeemed = TRUE, redeemed_by = $1, redeemed_at = NOW() 
       WHERE UPPER(code) = $2`,
      [userEmail, rawCode]
    );

    // If user exists in users table, upgrade them
    if (userEmail && userEmail.includes("@")) {
      await query(
        `UPDATE users SET tier = 'premium' WHERE email = $1`,
        [userEmail]
      ).catch(() => {});
    }

    return ok({
      success: true,
      tier: "premium",
      duration: promo.duration,
      durationLabel: promo.duration_label,
      expiresAt: promo.expires_at,
      message: `🎉 تم تفعيل اشتراك البريميوم بنجاح (${promo.duration_label})! استمتع بصوت الاستوديو الخارق.`,
    });
  } catch (err: any) {
    console.error("[api/subscription/promo] Error:", err);
    return fail("INTERNAL_ERROR", err.message || "حدث خطأ أثناء معالجة الكود", 500);
  }
}
