"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        if (d.data?.user?.email === "emil578jvcvn@gmail.com" || d.data?.user?.role === "admin") {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          setTimeout(() => router.push("/"), 2000);
        }
      })
      .catch(() => {
        setIsAdmin(false);
        setTimeout(() => router.push("/"), 2000);
      });
  }, [router]);

  if (isAdmin === null) return <div className="p-20 text-center text-white/50">جاري التحقق من الصلاحيات...</div>;

  if (isAdmin === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center p-6">
        <ShieldAlert className="w-20 h-20 text-red-500 mb-6" />
        <h1 className="text-3xl font-black text-white mb-2">غير مصرح لك بالدخول</h1>
        <p className="text-gray-400">هذه الصفحة مخصصة لمالك الموقع فقط. سيتم تحويلك للرئيسية...</p>
      </div>
    );
  }

  return <>{children}</>;
}
