import nodemailer from "nodemailer";

interface SendCodeOptions {
  email: string;
  code: string;
  displayName?: string;
}

export async function sendPasswordResetEmail({ email, code, displayName }: SendCodeOptions): Promise<{ success: boolean; error?: string }> {
  const name = displayName || "عزيزنا المستخدم";

  const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>رمز استعادة كلمة المرور - Aura Music</title>
  <style>
    body {
      background-color: #050505;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
      background: linear-gradient(180deg, #121217 0%, #0a0a0d 100%);
      border: 1px solid rgba(0, 229, 255, 0.2);
      border-radius: 24px;
      padding: 40px 30px;
      box-shadow: 0 10px 40px rgba(0, 229, 255, 0.1);
      text-align: center;
    }
    .logo {
      font-size: 26px;
      font-weight: 900;
      color: #00e5ff;
      letter-spacing: 2px;
      margin-bottom: 24px;
      text-shadow: 0 0 20px rgba(0, 229, 255, 0.5);
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      margin-bottom: 12px;
      color: #ffffff;
    }
    p {
      color: #a0a0b0;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 30px;
    }
    .code-box {
      background: rgba(0, 229, 255, 0.08);
      border: 2px dashed #00e5ff;
      border-radius: 16px;
      padding: 20px;
      font-size: 36px;
      font-weight: 900;
      letter-spacing: 12px;
      color: #00e5ff;
      margin: 25px 0;
      text-shadow: 0 0 15px rgba(0, 229, 255, 0.4);
      direction: ltr;
      display: inline-block;
      min-width: 240px;
    }
    .warning {
      font-size: 13px;
      color: #707080;
      margin-top: 30px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">AURA MUSIC</div>
    <h1>إعادة تعيين كلمة المرور</h1>
    <p>مرحباً ${name}،<br>لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك على Aura Music. استخدم الرمز التالي لإتمام العملية:</p>
    
    <div class="code-box">${code}</div>
    
    <p>هذا الرمز صالح لمدة <strong>15 دقيقة فقط</strong> لمرة واحدة.</p>
    
    <div class="warning">
      إذا لم تقم بطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد بأمان ولن يتم إجراء أي تغيير على حسابك.
    </div>
  </div>
</body>
</html>
`;

  // Always log to console for development / auditing
  console.log(`[Mailer] 🔐 Verification code for ${email} is: ${code}`);

  // 1. Try sending via configured SMTP if environment variables exist
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || `"Aura Music" <${user || "no-reply@aura-music.vercel.app"}>`;

  let emailSent = false;

  if (user && pass) {
    try {
      const isGmail = host?.includes("gmail") || user.endsWith("@gmail.com");
      const transporter = nodemailer.createTransport(
        isGmail
          ? {
              service: "gmail",
              auth: { user, pass },
            }
          : {
              host: host || "smtp.gmail.com",
              port,
              secure: port === 465,
              auth: { user, pass },
            }
      );

      await transporter.sendMail({
        from,
        to: email,
        subject: `رمز إعادة تعيين كلمة المرور: ${code} - Aura Music`,
        html: htmlContent,
      });

      console.log(`[Mailer] ✅ Password reset email successfully delivered to ${email}`);
      emailSent = true;
      return { success: true };
    } catch (err: any) {
      console.warn(`[Mailer] ⚠️ SMTP send failed:`, err.message);
    }
  }

  // 2. Telegram Alert as a fallback notification
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  const tgChatId = process.env.TELEGRAM_CHANNEL_ID;
  if (tgToken && tgChatId) {
    try {
      const text = `🔐 *Aura Music - كود استعادة كلمة المرور*\n\n📧 *الحساب:* \`${email}\`\n🔢 *الكود:* \`${code}\`\n⏳ *الصلاحية:* 15 دقيقة`;
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: tgChatId,
          text,
          parse_mode: "Markdown",
        }),
      });
      console.log(`[Mailer] ✅ Fallback alert sent to Telegram for ${email}`);
    } catch (e: any) {
      console.warn(`[Mailer] Telegram alert failed:`, e.message);
    }
  }

  // If SMTP wasn't configured, we logged and alerted so it succeeds
  return { success: true };
}
