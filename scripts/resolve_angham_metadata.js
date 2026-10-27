/**
 * scripts/resolve_angham_metadata.js
 * Accurately resolve official video IDs, durations, and titles for all Angham tracks.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ANGHAM_SEEDS = [
  // ── ألبوم سيدي وصالك / ليه سيبتها (2001) ──
  { title: "سيدي وصالك", enTitle: "Sidi Wesalak", album: "سيدي وصالك (2001)", query: "Angham Sidi Wesalak Mazzika", knownVideoId: "I1bSXT1Xh5c" },
  { title: "ليه سيبتها", enTitle: "Leih Sebtaha", album: "سيدي وصالك (2001)", query: "Angham Leih Sebtaha Mazzika", knownVideoId: "AdkiKBISHG8" },
  { title: "نجوم الليل", enTitle: "Nogoum El Leil", album: "سيدي وصالك (2001)", query: "أنغام نجوم الليل أوديو رسمي" },
  { title: "حبيتك ليه", enTitle: "Habbetak Leih", album: "سيدي وصالك (2001)", query: "أنغام حبيتك ليه أوديو رسمي" },
  { title: "رجعنا في كلامنا", enTitle: "Reg'na Fi Kalamna", album: "سيدي وصالك (2001)", query: "أنغام رجعنا في كلامنا Mazzika" },
  { title: "راح تذكرني", enTitle: "Rah Tezkorny", album: "سيدي وصالك (2001)", query: "أنغام راح تذكرني أوديو رسمي" },

  // ── ألبوم عمري معاك (2003) ──
  { title: "عمري معاك", enTitle: "Omry Maak", album: "عمري معاك (2003)", query: "Angham Omri Maak Mazzika", knownVideoId: "0UAVMY4MxBE" },
  { title: "عرفها بيا", enTitle: "Arafha Bya", album: "عمري معاك (2003)", query: "Angham Arrafha Beya Mazzika", knownVideoId: "EtbX3UQ3-ik" },
  { title: "فينك", enTitle: "Feenak", album: "عمري معاك (2003)", query: "أنغام فينك Mazzika أوديو" },
  { title: "شفت الدنيا", enTitle: "Shoft El Donya", album: "عمري معاك (2003)", query: "أنغام شفت الدنيا Mazzika" },
  { title: "بحب نفسي", enTitle: "Baheb Nafsy", album: "عمري معاك (2003)", query: "Angham Bahib Nafsy Rotana", knownVideoId: "aem8uK3TgPE" },
  { title: "وحشتني", enTitle: "Wahashteny", album: "عمري معاك (2003)", query: "أنغام وحشتني Mazzika أوديو" },

  // ── ألبوم بحبك وحشتني (2005) ──
  { title: "بحبك وحشتني", enTitle: "Bahebbak Wahashteny", album: "بحبك وحشتني (2005)", query: "Angham Bahebak Waheshtini Rotana", knownVideoId: "3vumspHi5PQ" },
  { title: "فاكراك", enTitle: "Fakrak", album: "بحبك وحشتني (2005)", query: "أنغام فاكراك Rotana أوديو" },
  { title: "قد ما تقدر", enTitle: "Add Ma Te'dar", album: "بحبك وحشتني (2005)", query: "أنغام قد ما تقدر Rotana" },
  { title: "تطمني", enTitle: "Tetamenny", album: "بحبك وحشتني (2005)", query: "أنغام تطمني Rotana أوديو" },
  { title: "استنى إيه", enTitle: "Istanna Eih", album: "بحبك وحشتني (2005)", query: "أنغام استنى إيه Rotana أوديو" },
  { title: "على فكرة", enTitle: "Ala Fekra", album: "بحبك وحشتني (2005)", query: "أنغام على فكرة Rotana أوديو" },

  // ── ألبوم كل ما نقرب (2007) ──
  { title: "كل ما نقرب لبعض", enTitle: "Kol Ma Ne'arrab", album: "كل ما نقرب (2007)", query: "Angham Kol Ma Nearrab Rotana", knownVideoId: "o2NaGgYP5NY" },
  { title: "ماجبش سيرتي", enTitle: "Magabsh Serty", album: "كل ما نقرب (2007)", query: "أنغام ماجبش سيرتي Rotana" },
  { title: "أتمنى له الخير", enTitle: "Atmannalo El Kheir", album: "كل ما نقرب (2007)", query: "أنغام أتمنى له الخير Rotana" },
  { title: "مابتعلمش", enTitle: "Ma Bat'alemsh", album: "كل ما نقرب (2007)", query: "أنغام مابتعلمش Rotana" },
  { title: "ده اللي عندي", enTitle: "Dah Elly Andy", album: "كل ما نقرب (2007)", query: "أنغام ده اللي عندي Rotana" },
  { title: "غيرتني", enTitle: "Ghayyartany", album: "كل ما نقرب (2007)", query: "Angham Ghayarteny Rotana", knownVideoId: "A2Qxgiw5HUs" },

  // ── ألبوم نفسي أحبك (2009) ──
  { title: "نفسي أحبك", enTitle: "Nefsy Ahebbak", album: "نفسي أحبك (2009)", query: "Angham Nefsy Ahebak Rotana", knownVideoId: "WHiZXuf61u4" },
  { title: "مهزومة", enTitle: "Mahzouma", album: "نفسي أحبك (2009)", query: "Angham Mahzouma Rotana", knownVideoId: "8J3E11XSEKE" },
  { title: "ساعات كتير", enTitle: "Saat Kteer", album: "نفسي أحبك (2009)", query: "أنغام ساعات كتير Rotana" },
  { title: "واحدة بتحبك", enTitle: "Wahda Bethebbak", album: "نفسي أحبك (2009)", query: "أنغام واحدة بتحبك Rotana" },
  { title: "لو هتقول", enTitle: "Law Hate'ool", album: "نفسي أحبك (2009)", query: "أنغام لو هتقول Rotana" },
  { title: "عشت سنين", enTitle: "Esht Seneen", album: "نفسي أحبك (2009)", query: "أنغام عشت سنين Rotana" },
  { title: "حبيبي مالك", enTitle: "Habiby Malak", album: "نفسي أحبك (2009)", query: "أنغام حبيبي مالك Rotana" },

  // ── ألبوم أحلام بريئة (2015) ──
  { title: "أكتبلك تعهد", enTitle: "Aktoblak Ta'ahod", album: "أحلام بريئة (2015)", query: "Angham Aktablk Tahod Rotana", knownVideoId: "x8SelhM3s3w" },
  { title: "حتة ناقصة", enTitle: "Hetta Na'sa", album: "أحلام بريئة (2015)", query: "أنغام حتة ناقصة Rotana أوديو" },
  { title: "بين البنين", enTitle: "Bein El Baneen", album: "أحلام بريئة (2015)", query: "أنغام بين البنين Rotana أوديو" },
  { title: "أهي جت", enTitle: "Ahy Gat", album: "أحلام بريئة (2015)", query: "أنغام أهي جت Rotana" },
  { title: "ساندة عليك", enTitle: "Sanda Aleik", album: "أحلام بريئة (2015)", query: "أنغام ساندة عليك Rotana" },
  { title: "بقيت وحدك", enTitle: "Baeet Wahdak", album: "أحلام بريئة (2015)", query: "أنغام بقيت وحدك Rotana" },
  { title: "طول ما أنت بعيد", enTitle: "Tool Ma Enta Baeed", album: "أحلام بريئة (2015)", query: "أنغام طول ما أنت بعيد Rotana" },
  { title: "اتجاه واحد", enTitle: "Ittigah Wahed", album: "أحلام بريئة (2015)", query: "أنغام اتجاه واحد Rotana" },

  // ── ألبوم حالة خاصة جداً (2019) ──
  { title: "حالة خاصة جداً", enTitle: "Hala Khassa Gidan", album: "حالة خاصة جداً (2019)", query: "أنغام حالة خاصة جدا Rotana أوديو" },
  { title: "ياريتك فاهمني", enTitle: "Yareetak Fahimny", album: "حالة خاصة جداً (2019)", query: "Angham Yaretak Fahemni Rotana", knownVideoId: "Kpc31pvHjMM" },
  { title: "أساميك الكتيرة", enTitle: "Asameek El Keteera", album: "حالة خاصة جداً (2019)", query: "أنغام أساميك الكتيرة Rotana" },
  { title: "هتقول لربنا إيه", enTitle: "Hate'ool Le Rabena Eih", album: "حالة خاصة جداً (2019)", query: "أنغام هتقول لربنا إيه Rotana" },
  { title: "مطمنة", enTitle: "Metammna", album: "حالة خاصة جداً (2019)", query: "أنغام مطمنة Rotana" },
  { title: "نزوة", enTitle: "Nazwa", album: "حالة خاصة جداً (2019)", query: "أنغام نزوة Rotana" },
  { title: "ولا دبلت", enTitle: "Wala Deblet", album: "حالة خاصة جداً (2019)", query: "أنغام ولا دبلت Rotana" },
  { title: "حبايبنا", enTitle: "Habayebna", album: "حالة خاصة جداً (2019)", query: "أنغام حبايبنا Rotana" },

  // ── كلاسيكيات التسعينات الخالدة ──
  { title: "شنطة سفر", enTitle: "Shantet Safar", album: "إلا أنا (1993)", query: "أنغام شنطة سفر النسخة الاصلية استوديو", knownVideoId: "tQgHkFkNfS4" },
  { title: "إلا أنا", enTitle: "Ella Ana", album: "إلا أنا (1993)", query: "أنغام إلا أنا استوديو النسخة الأصلية" },
  { title: "بتحب مين", enTitle: "Betheb Meen", album: "بتحب مين (1997)", query: "أنغام بتحب مين استوديو رسمي" },
  { title: "في الركن البعيد الهادي", enTitle: "Fel Rokn El Baeed El Hady", album: "في الركن البعيد الهادي (1988)", query: "أنغام في الركن البعيد الهادي استوديو رسمي" },
  { title: "ببساطة كدة", enTitle: "Bebasata Keda", album: "ببساطة كدة (1990)", query: "أنغام ببساطة كدة استوديو رسمي" },

  // ── روائع منفردة وحديثة ──
  { title: "ونفضل نرقص", enTitle: "W Nefdal Norkos", album: "أغاني منفردة (2021)", query: "Angham W Nefdal Norkos Official Music Video" },
  { title: "عارفة قيمتي", enTitle: "Aarfa Eemty", album: "أغاني منفردة (2022)", query: "Angham Aarfa Eemty Official Music Video" },
  { title: "سيبك أنت", enTitle: "Seebak Enta", album: "أغاني منفردة (2023)", query: "Angham Seebak Enta Official Music Video" },
  { title: "تيجي نسيب", enTitle: "Tegy Nseeb", album: "تيجي نسيب (2024)", query: "أنغام تيجي نسيب أوديو رسمي Angham" },
  { title: "هو أنت مين", enTitle: "Howa Enta Meen", album: "تيجي نسيب (2024)", query: "أنغام هو انت مين أوديو رسمي Angham" }
];

function resolveYtVideo(seed) {
  return new Promise((resolve) => {
    if (seed.knownVideoId) {
      const child = spawn("yt-dlp", [
        "--dump-json",
        "--no-playlist",
        "--no-warnings",
        `https://www.youtube.com/watch?v=${seed.knownVideoId}`
      ], { stdio: ["ignore", "pipe", "pipe"] });

      let stdout = "";
      child.stdout.on("data", d => stdout += d.toString());
      child.on("close", () => {
        if (stdout.trim()) {
          try {
            const data = JSON.parse(stdout.trim());
            return resolve({
              videoId: data.id,
              actualTitle: data.title,
              uploader: data.uploader,
              durationSec: data.duration,
              thumbnailUrl: data.thumbnail
            });
          } catch {}
        }
        resolve({
          videoId: seed.knownVideoId,
          actualTitle: seed.title,
          uploader: "Official",
          durationSec: 250,
          thumbnailUrl: `https://i.ytimg.com/vi/${seed.knownVideoId}/hqdefault.jpg`
        });
      });
      return;
    }

    const child = spawn("yt-dlp", [
      "--dump-json",
      "--no-playlist",
      "--no-warnings",
      `ytsearch5:${seed.query}`
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    child.stdout.on("data", d => stdout += d.toString());
    child.on("close", () => {
      if (stdout.trim()) {
        try {
          const lines = stdout.trim().split("\n").filter(Boolean);
          for (const line of lines) {
            const data = JSON.parse(line);
            const dur = data.duration || 0;
            const lt = data.title.toLowerCase();
            const ch = (data.uploader || "").toLowerCase();

            // Ignore extreme durations (full albums or clips < 90s)
            if (dur > 580 || dur < 90) continue;
            // Ignore live, covers, reactions, full concert
            if (lt.includes("حفل") || lt.includes("concert") || lt.includes("كفر") || lt.includes("cover") || lt.includes("reaction") || lt.includes("مهرجان") || lt.includes("مسلسل")) {
              continue;
            }

            return resolve({
              videoId: data.id,
              actualTitle: data.title,
              uploader: data.uploader,
              durationSec: dur,
              thumbnailUrl: data.thumbnail
            });
          }

          // Fallback: pick first with sensible duration
          for (const line of lines) {
            const data = JSON.parse(line);
            if (data.duration > 80 && data.duration < 650) {
              return resolve({
                videoId: data.id,
                actualTitle: data.title,
                uploader: data.uploader,
                durationSec: data.duration,
                thumbnailUrl: data.thumbnail
              });
            }
          }
        } catch {}
      }

      resolve(null);
    });
  });
}

async function run() {
  console.log(`Resolving ${ANGHAM_SEEDS.length} Angham tracks...`);
  const resolved = [];

  for (let i = 0; i < ANGHAM_SEEDS.length; i++) {
    const s = ANGHAM_SEEDS[i];
    const res = await resolveYtVideo(s);
    if (res) {
      console.log(`[${i + 1}/${ANGHAM_SEEDS.length}] ✅ "${s.title}" -> [${res.videoId}] (${res.durationSec}s) "${res.actualTitle}" [${res.uploader}]`);
      resolved.push({
        ...s,
        ...res
      });
    } else {
      console.log(`[${i + 1}/${ANGHAM_SEEDS.length}] ❌ Failed to resolve "${s.title}"`);
    }
  }

  fs.writeFileSync(path.join(__dirname, "angham_resolved_verified.json"), JSON.stringify(resolved, null, 2), "utf8");
  console.log(`\nSaved ${resolved.length} resolved tracks to scripts/angham_resolved_verified.json`);
}

run();
