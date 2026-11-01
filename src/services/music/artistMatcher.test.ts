import { describe, it, expect } from "vitest";
import { isStrictArtistMatch, hasUnwantedTags, findBestOfficialVideo, getArtistForms, extractSmartArtistAndTitle } from "./artistMatcher";

describe("artistMatcher", () => {
  it("accurately matches bilingual Arabic and Latin artist names", () => {
    expect(isStrictArtistMatch("عمرو دياب", "Amr Diab")).toBe(true);
    expect(isStrictArtistMatch("Amr Diab", "عمرو دياب")).toBe(true);
    expect(isStrictArtistMatch("تامر حسني", "Tamer Hosny")).toBe(true);
    expect(isStrictArtistMatch("عمرو دياب", "Black Rose · LORDEGRAF")).toBe(false);
    expect(isStrictArtistMatch("محمد حماقي", "Hamaki")).toBe(true);
    expect(isStrictArtistMatch("عمرو دياب", "Sarah Cover")).toBe(false);
  });

  it("tolerates Latin transliteration variants of dictionary artists", () => {
    expect(isStrictArtistMatch("Abdel Haleem Hafiz", "عبد الحليم حافظ")).toBe(true);
    expect(isStrictArtistMatch("Abyusif", "Abyusif I أبيوسف")).toBe(true);
    // the mislabeled re-upload channel must never pass as Abyusif
    expect(isStrictArtistMatch("Abyusif", "Aether Shade")).toBe(false);
    // short names must not fuzzy-collide with dictionary artists
    expect(isStrictArtistMatch("حمادة", "محمد حماقي")).toBe(false);
  });

  it("detects unwanted tags like remix, cover, slowed, karaoke", () => {
    expect(hasUnwantedTags("Tamally Maak (Remix)", "Tamally Maak")).toBe(true);
    expect(hasUnwantedTags("Tamally Maak (Cover by Sarah)", "Tamally Maak")).toBe(true);
    expect(hasUnwantedTags("Tamally Maak (Slowed)", "Tamally Maak")).toBe(true);
    expect(hasUnwantedTags("Tamally Maak", "Tamally Maak")).toBe(false);
    expect(hasUnwantedTags("Tamally Maak (Remix)", "Tamally Maak Remix")).toBe(false); // User explicitly asked for remix
  });

  it("selects the authentic official release over covers and fan edits", () => {
    const candidates = [
      {
        youtubeVideoId: "cover123456",
        title: "تملي معاك عمرو دياب بصوت سارة (Cover)",
        artist: "Sarah Music",
        channel: "Sarah Music",
        durationSec: 240,
      },
      {
        youtubeVideoId: "slowed12345",
        title: "عمرو دياب - تملى معاك, بطيء (slowed)",
        artist: "Introvert",
        channel: "Introvert",
        durationSec: 320,
      },
      {
        youtubeVideoId: "EgmXTmj62ic",
        title: "@AmrDiab - Tamally Maak | Official Music Video - HD Version | عمرو دياب - تملي معاك",
        artist: "Mazzika - مزيكا",
        channel: "Mazzika - مزيكا",
        durationSec: 260,
      },
      {
        youtubeVideoId: "album123456",
        title: "Amr Diab - Album Tamally Maak | عمرو دياب - البوم تملي معاك",
        artist: "Mazzika - مزيكا",
        channel: "Mazzika - مزيكا",
        durationSec: 2550, // Long video
      },
    ];

    const bestVid = findBestOfficialVideo(candidates, "تملي معاك", "عمرو دياب");
    expect(bestVid).toBe("EgmXTmj62ic");
  });

  it("extracts real singer and clean title accurately across different track types", () => {
    // 1. Ahmed Hussein - original
    const t1 = extractSmartArtistAndTitle("احمد حسين كليب الدمعه صعبة AHMED HUSSEN - ELDAM3A SA3BA", "Shaabeyat Channel");
    expect(t1.artist).toBe("احمد حسين");
    expect(t1.title).toBe("الدمعه صعبة");

    // 2. Donia El Alfy - trend version
    const t2 = extractSmartArtistAndTitle('ترند دنيا الالفي 2026 " الدمعه صعبه ـ انا مش خايفه من حاجة " سلامات حظ شعبي جديد 2026', "حظ شعبى - Haz Shaby");
    expect(t2.artist).toBe("دنيا الالفي");
    expect(t2.title).toBe("الدمعه صعبه");

    // 3. Foreign / English song
    const t3 = extractSmartArtistAndTitle("Adele - Hello (Official Music Video)", "Adele");
    expect(t3.artist).toBe("Adele");
    expect(t3.title).toBe("Hello");

    // 4. Amr Diab with channel Mazzika
    const t4 = extractSmartArtistAndTitle("عمرو دياب - مكانك", "Mazzika - مزيكا");
    expect(t4.artist).toBe("عمرو دياب");
    expect(t4.title).toBe("مكانك");
  });
});
