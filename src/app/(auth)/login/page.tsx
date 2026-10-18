"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Mail,
  Lock,
  KeyRound,
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type AuthView = "login" | "forgot_request" | "forgot_verify" | "forgot_success";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // View Mode: login | forgot_request | forgot_verify | forgot_success
  const [view, setView] = useState<AuthView>("login");

  // Form Fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // States
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // If URL has ?mode=forgot, open forgot mode directly
  useEffect(() => {
    if (searchParams.get("mode") === "forgot") {
      setView("forgot_request");
    }
  }, [searchParams]);

  // Handle standard Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "فشل تسجيل الدخول. تأكد من بياناتك.");
      }

      localStorage.setItem("aura_logged_in", "true");
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Send verification code to email
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "حدث خطأ أثناء إرسال الرمز.");
      }

      setInfo("تم إرسال كود التحقق بنجاح إلى بريدك الإلكتروني!");
      setView("forgot_verify");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Resend code in verify step
  const handleResendCode = async () => {
    if (resending) return;
    setResending(true);
    setError("");
    setInfo("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "تعذر إعادة إرسال الرمز.");
      }

      setInfo("تم إعادة إرسال رمز التحقق إلى بريدك الإلكتروني!");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  // Step 2: Verify code and reset password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (newPassword.length < 6) {
      setError("يجب أن تكون كلمة المرور 6 أحرف أو أرقام على الأقل.");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: code.trim(),
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "فشلت عملية تغيير كلمة المرور.");
      }

      setView("forgot_success");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchView = (newView: AuthView) => {
    setError("");
    setInfo("");
    setView(newView);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-black text-right" dir="rtl">
      {/* Background Aura */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] md:w-[40vw] md:h-[40vw] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass rounded-[2rem] p-8 md:p-12 relative z-10 border border-cyan-500/20 shadow-[0_0_50px_rgba(0,229,255,0.1)] transition-all duration-300"
      >
        {/* Dynamic Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-cyan-500 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-[0_0_30px_rgba(0,229,255,0.6)]">
            {view === "login" ? (
              <img src="/logo-v2.png" alt="Logo" className="w-10 h-10 object-contain drop-shadow-md" />
            ) : view === "forgot_success" ? (
              <CheckCircle2 className="w-10 h-10 text-black" />
            ) : (
              <ShieldCheck className="w-9 h-9 text-black" />
            )}
          </div>

          <h1 className="text-3xl font-black text-white mb-2">
            {view === "login" && "أهلاً بك مجدداً"}
            {view === "forgot_request" && "استعادة كلمة المرور"}
            {view === "forgot_verify" && "رمز التحقق"}
            {view === "forgot_success" && "تم التغيير بنجاح!"}
          </h1>

          <p className="text-gray-400 text-sm">
            {view === "login" && "سجل دخولك للاستماع لموسيقاك المفضلة"}
            {view === "forgot_request" && "أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق من 6 أرقام"}
            {view === "forgot_verify" && "أدخل كود التحقق المرسل لبريدك وكلمة المرور الجديدة"}
            {view === "forgot_success" && "تم تحديث كلمة المرور الخاصة بحسابك بنجاح"}
          </p>
        </div>

        {/* Global Error Banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center font-medium"
          >
            {error}
          </motion.div>
        )}

        {/* Global Info Banner */}
        {info && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm text-center font-medium"
          >
            {info}
          </motion.div>
        )}

        {/* Forms Switcher */}
        <AnimatePresence mode="wait">
          {/* ================= VIEW 1: LOGIN ================= */}
          {view === "login" && (
            <motion.form
              key="login_form"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleLogin}
              className="space-y-5"
            >
              <div className="space-y-1.5 text-right">
                <label className="text-sm font-bold text-gray-300">البريد الإلكتروني</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-left"
                    placeholder="name@example.com"
                  />
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                </div>
              </div>

              <div className="space-y-1.5 text-right">
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => switchView("forgot_request")}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-colors focus:outline-none"
                  >
                    نسيت كلمة المرور؟
                  </button>
                  <label className="text-sm font-bold text-gray-300">كلمة المرور</label>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-left"
                    placeholder="••••••••"
                  />
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-8 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>تسجيل الدخول</span>
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <p className="mt-8 text-center text-gray-400 text-sm">
                ليس لديك حساب؟{" "}
                <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 font-bold underline decoration-cyan-500/30 underline-offset-4">
                  سجل الآن
                </Link>
              </p>
            </motion.form>
          )}

          {/* ================= VIEW 2: FORGOT REQUEST (SEND CODE) ================= */}
          {view === "forgot_request" && (
            <motion.form
              key="forgot_request_form"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleRequestCode}
              className="space-y-5"
            >
              <div className="space-y-1.5 text-right">
                <label className="text-sm font-bold text-gray-300">البريد الإلكتروني لحسابك</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-left"
                    placeholder="name@example.com"
                  />
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>إرسال كود التحقق</span>
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={() => switchView("login")}
                  className="text-gray-400 hover:text-white text-sm inline-flex items-center gap-1.5 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>العودة لتسجيل الدخول</span>
                </button>
              </div>
            </motion.form>
          )}

          {/* ================= VIEW 3: FORGOT VERIFY & SET PASSWORD ================= */}
          {view === "forgot_verify" && (
            <motion.form
              key="forgot_verify_form"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleResetPassword}
              className="space-y-4"
            >
              {/* Target Email Banner */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300">
                <span className="text-gray-400">إرسال إلى:</span>
                <span className="font-mono text-cyan-300 font-bold" dir="ltr">{email}</span>
                <button
                  type="button"
                  onClick={() => switchView("forgot_request")}
                  className="text-cyan-400 hover:text-cyan-300 underline font-medium"
                >
                  تعديل
                </button>
              </div>

              {/* Verification Code Input */}
              <div className="space-y-1.5 text-right">
                <div className="flex justify-between items-center">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resending}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 disabled:opacity-50 font-medium"
                  >
                    <RefreshCw className={`w-3 h-3 ${resending ? "animate-spin" : ""}`} />
                    <span>إعادة إرسال الرمز</span>
                  </button>
                  <label className="text-sm font-bold text-gray-300">رمز التحقق (6 أرقام)</label>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    dir="ltr"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-white/5 border border-cyan-500/40 rounded-xl px-4 py-3.5 text-center text-2xl font-mono tracking-[8px] text-cyan-300 placeholder-gray-600 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-black"
                    placeholder="••••••"
                  />
                  <KeyRound className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5 text-right">
                <label className="text-sm font-bold text-gray-300">كلمة المرور الجديدة</label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-left"
                    placeholder="••••••••"
                  />
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5 text-right">
                <label className="text-sm font-bold text-gray-300">تأكيد كلمة المرور</label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    dir="ltr"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all text-left"
                    placeholder="••••••••"
                  />
                  <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center gap-2 group disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>تأكيد تغيير كلمة المرور</span>
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => switchView("login")}
                  className="text-gray-400 hover:text-white text-sm inline-flex items-center gap-1.5 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>إلغاء والعودة لتسجيل الدخول</span>
                </button>
              </div>
            </motion.form>
          )}

          {/* ================= VIEW 4: SUCCESS ================= */}
          {view === "forgot_success" && (
            <motion.div
              key="forgot_success_view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="text-center space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-400 rounded-full mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>

              <div>
                <p className="text-gray-300 text-sm leading-relaxed">
                  تم تغيير كلمة المرور الخاصة بحسابك بنجاح! يمكنك الآن تسجيل الدخول مباشرة باستخدام كلمة المرور الجديدة.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setPassword("");
                  setCode("");
                  setNewPassword("");
                  setConfirmPassword("");
                  switchView("login");
                }}
                className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center gap-2"
              >
                <span>تسجيل الدخول بكلمة المرور الجديدة</span>
                <ArrowLeft className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <LoginForm />
    </Suspense>
  );
}
