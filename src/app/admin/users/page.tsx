"use client";

import { useState } from "react";
import { Search, Crown, CheckCircle2, ShieldAlert } from "lucide-react";

export default function AdminUsersPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; msg: string } | null>(null);

  const handleUpgrade = async (tier: "premium" | "free") => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/users/upgrade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, tier }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult({ success: true, msg: `تم ترقية ${data.data.user.display_name} بنجاح إلى ${tier === 'premium' ? 'بريميوم' : 'مجاني'}` });
      } else {
        setResult({ success: false, msg: data.error?.message || "حدث خطأ" });
      }
    } catch (e) {
      setResult({ success: false, msg: "فشل الاتصال بالخادم" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-20 px-6">
      <div className="flex flex-col items-center justify-center mb-10 text-center">
        <div className="w-16 h-16 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(234,179,8,0.4)]">
          <Crown className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-black text-white">إدارة المشتركين</h1>
        <p className="text-gray-400 mt-2">من هنا يمكنك إعطاء صلاحيات البريميوم (Premium) لأي إيميل</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl p-6 md:p-10 shadow-2xl backdrop-blur-xl">
        <label className="block text-sm font-bold text-gray-300 mb-3">البريد الإلكتروني للمستخدم</label>
        <div className="relative mb-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="مثال: user@example.com"
            className="w-full bg-black/50 border border-white/10 rounded-xl py-4 px-5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500/50 transition-colors"
          />
        </div>

        {result && (
          <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${result.success ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            {result.success ? <CheckCircle2 className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            <span className="font-bold text-sm">{result.msg}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            disabled={loading || !email}
            onClick={() => handleUpgrade("premium")}
            className="w-full sm:flex-1 py-4 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white font-black text-lg transition-all shadow-[0_0_20px_rgba(234,179,8,0.3)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? "جاري التحديث..." : "ترقية إلى بريميوم 👑"}
          </button>
          
          <button
            disabled={loading || !email}
            onClick={() => handleUpgrade("free")}
            className="w-full sm:w-auto px-6 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm transition-all disabled:opacity-50"
          >
            إزالة البريميوم
          </button>
        </div>
      </div>
    </div>
  );
}
