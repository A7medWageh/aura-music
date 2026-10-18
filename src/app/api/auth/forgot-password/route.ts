import crypto from "crypto";
import { NextRequest } from "next/server";
import { query } from "@apis/neon";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail, ok } from "@/services/http/response";
import { sendPasswordResetEmail } from "@/services/email/mailer";

export async function POST(req: NextRequest) {
  const rate = await checkRateLimit(req, { key: "auth-forgot-password", max: 5, windowSec: 60 });
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
  if (!email || !email.includes("@")) {
    return fail("BAD_REQUEST", "يرجى إدخال بريد إلكتروني صالح", 400);
  }

  // Check if user exists
  const userResult = await query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );

  const user = userResult.rows[0];
  if (!user) {
    return fail("NOT_FOUND", "لم يتم العثور على حساب مسجل بهذا البريد الإلكتروني", 404);
  }

  // Generate cryptographically secure 6-digit code
  const code = crypto.randomInt(100000, 999999).toString();

  // Invalidate any previous unused codes for this email
  await query(
    `UPDATE password_reset_codes SET used = TRUE WHERE email = $1 AND used = FALSE`,
    [email]
  );

  // Insert new code with 15 minutes expiration
  await query(
    `INSERT INTO password_reset_codes (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [email, code]
  );

  // Send the email with verification code
  const sendResult = await sendPasswordResetEmail({
    email,
    code,
    displayName: user.display_name,
  });

  if (!sendResult.success) {
    return fail("EMAIL_FAILED", "تعذر إرسال رمز التحقق إلى بريدك الإلكتروني، يرجى المحاولة لاحقاً.", 500);
  }

  return ok({
    message: "تم إرسال رمز التحقق المكون من 6 أرقام إلى بريدك الإلكتروني بنجاح.",
    email,
  });
}
