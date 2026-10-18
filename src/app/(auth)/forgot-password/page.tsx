"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, KeyRound, Loader2, ArrowRight, ArrowLeft, CheckCircle2, ShieldCheck, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ForgotPasswordPage() {
  const router = useRouter();

  // Steps: 1 = Email Input, 2 = Code & New Password, 3 = Success
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Step 1: Request reset code
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

      setInfo("تم إرسال كود التحقق بنجاح! تفقد بريدك الإلكتروني.");
      setStep(2);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Resend code in Step 2
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

  // Step 2: Verify code and update password
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

      setStep(3);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-black text-right" dir="rtl">
      {/* Background Aura */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] md:w-[40vw] md:h-[40vw] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass rounded-[2rem] p-8 md:p-12 relative z-10 border border-cyan-500/20 shadow-[0_0_50px_rgba(0,229,255,0.1)]"
      >
        {/* Top Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-cyan-500 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-[0_0_30px_rgba(0,229,255,0.6)]">
            <ShieldCheck className="w-9 h-9 text-black" />
          </div>
          <h1 className="text-3xl font-black text-white mb-2">استعادة الحساب</h1>
          <p className="text-gray-400 text-sm">
            {step === 1 && "أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق لتغيير كلمة المرور"}
            {step === 2 && "أدخل رمز التحقق المكون من 6 أرقام وكلمة المرور الجديدة"}
            {step === 3 && "تم تحديث كلمة المرور بنجاح"}
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center font-medium"
          >
            {error}
          </motion.div>
        )}

        {info && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-sm text-center font-medium"
          >
            {info}
          </motion.div>
        )}

        {/* Steps Content */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.form
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleRequestCode}
              className="space-y-5"
            >
              <div className="space-y-1.5">
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

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-8 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center gap-2 group disabled:opacity-50"
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
                <Link
                  href="/login"
                  className="text-gray-400 hover:text-white text-sm inline-flex items-center gap-1.5 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>العودة لتسجيل الدخول</span>
                </Link>
              </div>
            </motion.form>
          )}

          {step === 2 && (
            <motion.form
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleResetPassword}
              className="space-y-4"
            >
              {/* Target Email Banner */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300">
                <span className="text-gray-400">إرسال إلى:</span>
                <span className="font-mono text-cyan-300 font-bold" dir="ltr">{email}</span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-cyan-400 hover:text-cyan-300 underline font-medium"
                >
                  تعديل
                </button>
              </div>

              {/* Verification Code Input */}
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
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
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-gray-300">تأكيد كلمة المرور الجديدة</label>
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
            </motion.form>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <div className="w-20 h-20 bg-emerald-500/20 border-2 border-emerald-400 rounded-full mx-auto flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-white mb-2">تم التغيير بنجاح!</h2>
                <p className="text-gray-400 text-sm">
                  تم تحديث كلمة المرور الخاصة بحسابك بنجاح. يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.
                </p>
              </div>

              <button
                type="button"
                onClick={() => router.push("/login")}
                className="w-full py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-black rounded-xl transition-all shadow-[0_0_20px_rgba(0,229,255,0.4)] hover:shadow-[0_0_30px_rgba(0,229,255,0.6)] flex items-center justify-center gap-2"
              >
                <span>تسجيل الدخول الآن</span>
                <ArrowLeft className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
