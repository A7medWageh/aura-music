import nodemailer from "nodemailer";

interface SendCodeOptions {
  email: string;
  code: string;
  displayName?: string;
}

export async function sendPasswordResetEmail({
  email,
  code,
  displayName,
}: SendCodeOptions): Promise<{ success: boolean; error?: string; provider?: string }> {
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

  console.log(`[Mailer] 🔐 Verification code for ${email} is: ${code}`);

  // 1. Resend API (Recommended for Vercel Serverless HTTP)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const fromEmail = process.env.RESEND_FROM || "Aura Music <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `رمز إعادة تعيين كلمة المرور: ${code} - Aura Music`,
          html: htmlContent,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.id) {
        console.log(`[Mailer] ✅ Resend delivered email to ${email} (id: ${resData.id})`);
        return { success: true, provider: "resend" };
      } else {
        console.warn(`[Mailer] ⚠️ Resend error:`, resData);
      }
    } catch (e: any) {
      console.warn(`[Mailer] ⚠️ Resend exception:`, e.message);
    }
  }

  // 2. Brevo HTTP API (Free 300 emails/day to any inbox without domain DNS setup)
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (brevoApiKey) {
    try {
      const senderEmail = process.env.BREVO_FROM || "notifications@aura-music.vercel.app";
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: "Aura Music", email: senderEmail },
          to: [{ email }],
          subject: `رمز إعادة تعيين كلمة المرور: ${code} - Aura Music`,
          htmlContent,
        }),
      });

      if (res.ok) {
        console.log(`[Mailer] ✅ Brevo delivered email to ${email}`);
        return { success: true, provider: "brevo" };
      } else {
        const errorText = await res.text();
        console.warn(`[Mailer] ⚠️ Brevo error:`, errorText);
      }
    } catch (e: any) {
      console.warn(`[Mailer] ⚠️ Brevo exception:`, e.message);
    }
  }

  // 3. SMTP Transport (e.g. Gmail App Password)
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (smtpUser && smtpPass) {
    try {
      const isGmail = smtpUser.endsWith("@gmail.com") || process.env.SMTP_HOST?.includes("gmail");
      const transporter = nodemailer.createTransport(
        isGmail
          ? {
              service: "gmail",
              auth: { user: smtpUser, pass: smtpPass },
            }
          : {
              host: process.env.SMTP_HOST || "smtp.gmail.com",
              port: Number(process.env.SMTP_PORT || 587),
              secure: Number(process.env.SMTP_PORT) === 465,
              auth: { user: smtpUser, pass: smtpPass },
            }
      );

      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"Aura Music" <${smtpUser}>`,
        to: email,
        subject: `رمز إعادة تعيين كلمة المرور: ${code} - Aura Music`,
        html: htmlContent,
      });

      console.log(`[Mailer] ✅ SMTP delivered email to ${email}`);
      return { success: true, provider: "smtp" };
    } catch (err: any) {
      console.warn(`[Mailer] ⚠️ SMTP send failed:`, err.message);
    }
  }

  // 4. Telegram Fallback notification
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
      console.log(`[Mailer] ✅ Telegram alert sent for ${email}`);
    } catch (e: any) {
      console.warn(`[Mailer] Telegram alert failed:`, e.message);
    }
  }

  // If no email provider was configured or sending failed:
  console.error(`[Mailer] ❌ No valid email provider configured (missing RESEND_API_KEY, BREVO_API_KEY, or SMTP_USER/SMTP_PASS).`);
  return {
    success: false,
    error: "لم يتم ضبط خدمة إرسال البريد الإلكتروني (مثل Resend أو Gmail SMTP) في إعدادات الخادم بعد.",
  };
}
