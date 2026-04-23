"use client";

import { FormEvent, useEffect, useState } from "react";
import { getCsrfToken } from "@/services/security/clientCsrf";

type AuthUser = { id: string; email: string; displayName: string };

export function AuthMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState("");

  const refreshMe = async (force = false) => {
    // Optimization: Skip auth check if we know we're logged out (localStorage hint)
    // This stops the 401 spam in the console for guests.
    if (!force && typeof window !== "undefined" && !localStorage.getItem("aura_logged_in")) {
      return;
    }

    try {
      const response = await fetch("/api/auth/me");
      if (!response.ok) {
        setUser(null);
        if (typeof window !== "undefined") localStorage.removeItem("aura_logged_in");
        return;
      }
      const payload = (await response.json()) as { data?: { user?: AuthUser } };
      setUser(payload.data?.user ?? null);
      if (payload.data?.user && typeof window !== "undefined") {
        localStorage.setItem("aura_logged_in", "true");
      }
    } catch (err) {
      setUser(null);
    }
  };

  useEffect(() => {
    // On first load, we still check once if the flag is there
    void refreshMe();
  }, []);

  const submitSignup = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("جاري إنشاء الحساب...");
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, displayName })
    });
    if (!response.ok) {
      const body = await response.json();
      setStatus(body?.error?.message ?? "فشل إنشاء الحساب");
      return;
    }
    setStatus("تم إنشاء الحساب");
    await refreshMe();
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("جاري تسجيل الدخول...");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      const body = await response.json();
      setStatus(body?.error?.message ?? "فشل تسجيل الدخول");
      return;
    }
    setStatus("تم تسجيل الدخول");
    await refreshMe();
  };

  const logout = async () => {
    const csrfToken = await getCsrfToken();
    await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrfToken } });
    setUser(null);
    setStatus("تم تسجيل الخروج");
  };

  if (user) {
    return (
      <div className="rounded-full bg-panel px-4 py-2 text-sm">
        {user.displayName} <button onClick={logout}>خروج</button>
      </div>
    );
  }

  return (
    <details className="rounded-full bg-panel px-4 py-2 text-sm">
      <summary className="cursor-pointer">الحساب</summary>
      <form className="mt-2 flex min-w-[260px] flex-col gap-2" onSubmit={submitLogin}>
        <input
          className="rounded border border-white/20 bg-surface px-2 py-1 text-xs"
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="اسم العرض (لإنشاء حساب)"
          value={displayName}
        />
        <input
          className="rounded border border-white/20 bg-surface px-2 py-1 text-xs"
          onChange={(e) => setEmail(e.target.value)}
          placeholder="البريد الإلكتروني"
          value={email}
        />
        <input
          className="rounded border border-white/20 bg-surface px-2 py-1 text-xs"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة السر"
          type="password"
          value={password}
        />
        <div className="flex gap-2">
          <button className="rounded bg-accent px-2 py-1 text-xs font-semibold text-black" onClick={submitLogin}>
            دخول
          </button>
          <button className="rounded bg-white/10 px-2 py-1 text-xs" onClick={submitSignup} type="button">
            إنشاء حساب
          </button>
        </div>
        {status && <p className="text-xs text-white/70">{status}</p>}
      </form>
    </details>
  );
}
