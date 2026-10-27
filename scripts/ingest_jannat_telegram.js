/**
 * scripts/ingest_jannat_telegram.js
 * Ingest Jannat Classics into Telegram CDN and Neon DB cache.
 * Uses exact filename matching for yt-dlp on Windows.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");

const DB_URL = "postgresql://neondb_owner:npg_afv7RLgh1oSF@ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require";
const TELEGRAM_BOT_TOKEN = "8831422517:AAEXQFzQxzcyIKWI1WtfVh2XGzguGXAnCak";
const TELEGRAM_CHANNEL_ID = "-1004310944763";

// Read Jannat classics list from src/data/jannatClassics.ts
function loadJannatTracks() {
  const fileContent = fs.readFileSync(path.join(__dirname, "../src/data/jannatClassics.ts"), "utf8");
  const tracks = [];
  const regex = /songId:\s*"([^"]+)",\s*youtubeVideoId:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*enTitle:\s*"([^"]+)",\s*album:\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(fileContent)) !== null) {
    tracks.push({
      songId: match[1],
      youtubeVideoId: match[2],
      title: match[3],
      enTitle: match[4],
      album: match[5],
      artist: "جنات"
    });
  }
  return tracks;
}

function downloadYtAudio(title, enTitle, videoId) {
  return new Promise((resolve, reject) => {
    const filePrefix = `scratch_jannat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const tempPattern = path.join(__dirname, `../${filePrefix}_%(id)s.m4a`);
    const parentDir = path.join(__dirname, "..");

    const runYtDlp = (query, isFallback = false) => {
      const child = spawn("yt-dlp", [
        "-f", "ba[ext=m4a]/ba[ext=mp3]/bestaudio/ba/b",
        "--no-warnings",
        "--no-playlist",
        "-o", tempPattern,
        query
      ], { stdio: "pipe" });

      let stderrText = "";
      child.stderr.on("data", (d) => { stderrText += d.toString(); });

      child.on("close", async (code) => {
        const files = fs.readdirSync(parentDir).filter(f => f.startsWith(filePrefix) && f.endsWith(".m4a"));

        if (code === 0 && files.length > 0) {
          const targetFile = path.join(parentDir, files[0]);
          const extractedId = files[0].replace(`${filePrefix}_`, "").replace(".m4a", "");
          try {
            const buf = await fs.promises.readFile(targetFile);
            await fs.promises.unlink(targetFile);
            resolve({ buffer: buf, actualVideoId: extractedId || videoId });
          } catch (readErr) {
            reject(readErr);
          }
        } else if (!isFallback && enTitle) {
          console.log(`    ⚠️ Direct videoId failed, searching YouTube for "Jannat ${enTitle}"...`);
          runYtDlp(`ytsearch1:Jannat ${enTitle}`, true);
        } else {
          files.forEach(f => {
            try { fs.unlinkSync(path.join(parentDir, f)); } catch {}
          });
          reject(new Error(`yt-dlp failed (code ${code}): ${stderrText.slice(0, 150)}`));
        }
      });
    };

    runYtDlp(`https://www.youtube.com/watch?v=${videoId}`);
  });
}

async function uploadToTelegram(buffer, title, artist, duration = 0) {
  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHANNEL_ID);
  formData.append(
    "audio",
    new Blob([buffer], { type: "audio/mp4" }),
    `${title}.m4a`
  );
  formData.append("title", title);
  formData.append("performer", artist);
  if (duration > 0) formData.append("duration", String(Math.round(duration)));

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAudio`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(60000)
  });

  const data = await res.json();
  if (data.ok && (data.result?.audio || data.result?.document)) {
    const media = data.result.audio || data.result.document;
    return {
      fileId: media.file_id,
      messageId: data.result.message_id,
      duration: media.duration || duration,
      fileSize: media.file_size || buffer.length,
      mimeType: media.mime_type || "audio/mp4"
    };
  } else {
    throw new Error(`Telegram error: ${data.description || "Upload failed"}`);
  }
}

async function main() {
  console.log("🚀 Starting Jannat Classics Telegram Ingest...");
  const tracks = loadJannatTracks();
  console.log(`Loaded ${tracks.length} tracks from jannatClassics.ts`);

  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log("Connected to Neon DB.");

  // Get already cached videoIds and titles
  const cacheRes = await client.query("SELECT video_id, title FROM telegram_audio_cache");
  const cachedVideoIds = new Set(cacheRes.rows.map(r => r.video_id).filter(Boolean));
  const cachedTitles = new Set(cacheRes.rows.map(r => r.title?.trim().toLowerCase()).filter(Boolean));

  console.log(`Current total cached in DB: ${cacheRes.rows.length}`);

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const isCached = cachedVideoIds.has(track.youtubeVideoId);

    if (isCached) {
      console.log(`[${i + 1}/${tracks.length}] ⏭️ Already cached: ${track.title} (${track.youtubeVideoId})`);
      skippedCount++;
      continue;
    }

    console.log(`[${i + 1}/${tracks.length}] ⏳ Ingesting: ${track.title} - ${track.album}...`);

    try {
      // 1. Download audio via yt-dlp (with enTitle search fallback)
      const { buffer: audioBuffer, actualVideoId } = await downloadYtAudio(track.title, track.enTitle, track.youtubeVideoId);
      console.log(`  Downloaded ${audioBuffer.length} bytes (vid: ${actualVideoId}). Uploading to Telegram...`);

      // 2. Upload to Telegram
      const tgRes = await uploadToTelegram(audioBuffer, track.title, track.artist);
      console.log(`  Uploaded to Telegram. File ID: ${tgRes.fileId.slice(0, 15)}...`);

      // 3. Save to Neon DB with both actual video ID and original song ID
      await client.query(
        `INSERT INTO telegram_audio_cache (video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tg_file_id) DO NOTHING`,
        [
          actualVideoId || track.youtubeVideoId,
          track.songId,
          track.title,
          track.artist,
          tgRes.fileId,
          tgRes.messageId,
          tgRes.duration,
          tgRes.fileSize,
          tgRes.mimeType
        ]
      );

      // Also index original track.youtubeVideoId if different
      if (actualVideoId && actualVideoId !== track.youtubeVideoId) {
        try {
          await client.query(
            `INSERT INTO telegram_audio_cache (video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (tg_file_id) DO NOTHING`,
            [
              track.youtubeVideoId,
              track.songId,
              track.title,
              track.artist,
              tgRes.fileId,
              tgRes.messageId,
              tgRes.duration,
              tgRes.fileSize,
              tgRes.mimeType
            ]
          );
        } catch {}
      }

      cachedVideoIds.add(track.youtubeVideoId);
      if (actualVideoId) cachedVideoIds.add(actualVideoId);
      cachedTitles.add(track.title.toLowerCase());
      successCount++;
      console.log(`  ✅ Successfully cached: ${track.title}`);

      // Pause to avoid Telegram flood limits
      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.error(`  ❌ Failed for ${track.title}:`, err.message);
      failedCount++;
    }
  }

  await client.end();
  console.log(`\n🎉 Ingest Finished! Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
