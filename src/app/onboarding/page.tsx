"use client";

import { FormEvent, useState } from "react";
import { getCsrfToken } from "@/services/security/clientCsrf";

const ARTISTS = ["The Weeknd", "Fairuz", "Amr Diab", "Adele", "Drake", "Cairokee"];
const MOODS = ["تركيز", "جيم", "رايق", "حزين", "حفلة", "رومانسي"];

export default function OnboardingPage() {
  const [favoriteArtists, setFavoriteArtists] = useState<string[]>([]);
  const [moods, setMoods] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");

  const toggle = (value: string, list: string[], setList: (items: string[]) => void) => {
    if (list.includes(value)) {
      setList(list.filter((item) => item !== value));
    } else {
      setList([...list, value]);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("بيحفظ...");
    const csrfToken = await getCsrfToken();

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ favoriteArtists, moods })
    });

    if (!response.ok) {
      if (response.status === 401) {
        setStatus("لازم تسجل دخول قبل الحفظ.");
      } else {
        setStatus("الحفظ فشل");
      }
      return;
    }
    setStatus("اتحفظت. الرئيسية هتبقى على ذوقك.");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-3xl font-bold">تهيئة حسابك</h2>
        <p className="mt-2 text-white/70">اختار الفنانين والمود اللي بتحبه عشان نضبطلك الرئيسية.</p>
      </div>

      <form className="space-y-6 rounded-2xl bg-panel p-6" onSubmit={onSubmit}>
        <div>
          <p className="mb-2 text-sm font-semibold">الفنانين المفضلين</p>
          <div className="flex flex-wrap gap-2">
            {ARTISTS.map((artist) => (
              <button
                className={`rounded-full px-3 py-2 text-sm ${
                  favoriteArtists.includes(artist) ? "bg-accent text-black" : "bg-white/10"
                }`}
                key={artist}
                onClick={(e) => {
                  e.preventDefault();
                  toggle(artist, favoriteArtists, setFavoriteArtists);
                }}
                type="button"
              >
                {artist}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">المود</p>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((mood) => (
              <button
                className={`rounded-full px-3 py-2 text-sm ${
                  moods.includes(mood) ? "bg-accent text-black" : "bg-white/10"
                }`}
                key={mood}
                onClick={(e) => {
                  e.preventDefault();
                  toggle(mood, moods, setMoods);
                }}
                type="button"
              >
                {mood}
              </button>
            ))}
          </div>
        </div>

        <button className="rounded-lg bg-accent px-4 py-2 font-semibold text-black" type="submit">
          احفظ التفضيلات
        </button>
        <p className="text-sm text-white/70">{status}</p>
      </form>
    </div>
  );
}
