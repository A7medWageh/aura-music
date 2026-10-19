import { describe, it, expect } from "vitest";
import { isStrictArtistMatch, hasUnwantedTags, findBestOfficialVideo, getArtistForms } from "./artistMatcher";

describe("artistMatcher", () => {
  it("accurately matches bilingual Arabic and Latin artist names", () => {
    expect(isStrictArtistMatch("عمرو دياب", "Amr Diab")).toBe(true);
    expect(isStrictArtistMatch("Amr Diab", "عمرو دياب")).toBe(true);
    expect(isStrictArtistMatch("تامر حسني", "Tamer Hosny")).toBe(true);
    expect(isStrictArtistMatch("عمرو دياب", "Black Rose · LORDEGRAF")).toBe(false);
    expect(isStrictArtistMatch("محمد حماقي", "Hamaki")).toBe(true);
    expect(isStrictArtistMatch("عمرو دياب", "Sarah Cover")).toBe(false);
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
});
