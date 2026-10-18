import { NextRequest } from "next/server";
import { query } from "@apis/neon";
import { hashPassword } from "@/services/auth/password";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail, ok } from "@/services/http/response";

export async function POST(req: NextRequest) {
  const rate = await checkRateLimit(req, { key: "auth-reset-password", max: 10, windowSec: 60 });
  if (!rate.allowed) {
    return fail("RATE_LIMITED", "محاولات كثيرة جداً، يرجى الانتظار دقيقة والمحاولة مجدداً.", 429);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", "بيانات غير صالحة", 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").trim();
  const newPassword = String(body.newPassword ?? "").trim();

  if (!email || !code || !newPassword) {
    return fail("BAD_REQUEST", "جميع الحقول مطلوبة (البريد، الرمز، وكلمة المرور الجديدة)", 400);
  }

  if (newPassword.length < 6) {
    return fail("BAD_REQUEST", "يجب أن تتكون كلمة المرور الجديدة من 6 خانات على الأقل", 400);
  }

  // Find verification code
  const codeResult = await query<{
    id: string;
    expires_at: string;
    used: boolean;
  }>(
    `
      SELECT id, expires_at, used
      FROM password_reset_codes
      WHERE email = $1 AND code = $2
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [email, code]
  );

  const resetRecord = codeResult.rows[0];
  if (!resetRecord || resetRecord.used) {
    return fail("INVALID_CODE", "رمز التحقق غير صحيح أو قد تم استخدامه من قبل", 400);
  }

  if (new Date(resetRecord.expires_at).getTime() < Date.now()) {
    return fail("EXPIRED_CODE", "انتهت صلاحية رمز التحقق (صالح لمدة 15 دقيقة)، يرجى طلب رمز جديد", 400);
  }

  // Find user
  const userResult = await query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );

  const user = userResult.rows[0];
  if (!user) {
    return fail("NOT_FOUND", "المستخدم غير موجود", 404);
  }

  // Hash new password
  const newHash = await hashPassword(newPassword);

  // Update password in auth_accounts and reset any lockout
  await query(
    `
      UPDATE auth_accounts
      SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL, updated_at = NOW()
      WHERE user_id = $2
    `,
    [newHash, user.id]
  );

  // Mark code as used
  await query(
    `UPDATE password_reset_codes SET used = TRUE WHERE id = $1`,
    [resetRecord.id]
  );

  return ok({
    message: "تم تغيير كلمة المرور بنجاح! يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.",
  });
}
