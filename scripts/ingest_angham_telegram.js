/**
 * scripts/ingest_angham_telegram.js
 * Ingest verified Angham Classics into Telegram CDN and Neon DB cache.
 * Reads directly from src/data/anghamClassics.ts
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require("pg");

const DB_URL = "postgresql://neondb_owner:npg_afv7RLgh1oSF@ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require";
const TELEGRAM_BOT_TOKEN = "8831422517:AAEXQFzQxzcyIKWI1WtfVh2XGzguGXAnCak";
const TELEGRAM_CHANNEL_ID = "-1004310944763";

function loadAnghamTracks() {
  const fileContent = fs.readFileSync(path.join(__dirname, "../src/data/anghamClassics.ts"), "utf8");
  const tracks = [];
  const regex = /songId:\s*"([^"]+)",\s*youtubeVideoId:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*enTitle:\s*"([^"]+)",\s*album:\s*"([^"]+)",\s*duration:\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(fileContent)) !== null) {
    tracks.push({
      songId: match[1],
      youtubeVideoId: match[2],
      title: match[3],
      enTitle: match[4],
      album: match[5],
      durationStr: match[6],
      artist: "أنغام"
    });
  }
  return tracks;
}

function parseDurationSec(durStr) {
  if (!durStr) return 240;
  const parts = durStr.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 240;
}

function downloadYtAudio(videoId) {
  return new Promise((resolve, reject) => {
    const filePrefix = `scratch_angham_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const tempPattern = path.join(__dirname, `../${filePrefix}_%(id)s.m4a`);
    const parentDir = path.join(__dirname, "..");

    const child = spawn("yt-dlp", [
      "-f", "ba[ext=m4a]/ba[ext=mp3]/bestaudio/ba/b",
      "--no-warnings",
      "--no-playlist",
      "-o", tempPattern,
      `https://www.youtube.com/watch?v=${videoId}`
    ], { stdio: "pipe" });

    let stderr = "";
    child.stderr.on("data", d => stderr += d.toString());

    child.on("close", async code => {
      const files = fs.readdirSync(parentDir).filter(f => f.startsWith(filePrefix));
      if (code === 0 && files.length > 0) {
        const targetFile = path.join(parentDir, files[0]);
        try {
          const buf = await fs.promises.readFile(targetFile);
          await fs.promises.unlink(targetFile);
          resolve(buf);
        } catch (err) {
          reject(err);
        }
      } else {
        files.forEach(f => {
          try { fs.unlinkSync(path.join(parentDir, f)); } catch {}
        });
        reject(new Error(`yt-dlp download failed: ${stderr.slice(0, 150)}`));
      }
    });
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
    signal: AbortSignal.timeout(90000)
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
  console.log("🚀 Starting Angham Verified Classics Telegram Ingestion...");
  const tracks = loadAnghamTracks();
  console.log(`Loaded ${tracks.length} verified tracks from anghamClassics.ts`);

  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log("Connected to Neon DB.");

  const cacheRes = await client.query("SELECT video_id, song_id, title FROM telegram_audio_cache WHERE artist = 'أنغام'");
  const cachedVideoIds = new Set(cacheRes.rows.map(r => r.video_id).filter(Boolean));
  const cachedTitles = new Set(cacheRes.rows.map(r => r.title?.trim().toLowerCase()).filter(Boolean));

  console.log(`Currently cached Angham tracks in DB: ${cacheRes.rows.length}`);

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const isCached = cachedVideoIds.has(track.youtubeVideoId) || cachedTitles.has(track.title.toLowerCase());

    if (isCached) {
      console.log(`[${i + 1}/${tracks.length}] ⏭️ Already cached: ${track.title} (${track.youtubeVideoId})`);
      skippedCount++;
      continue;
    }

    console.log(`[${i + 1}/${tracks.length}] ⏳ Ingesting: ${track.title} - ${track.album} (ID: ${track.youtubeVideoId})...`);

    try {
      const durSec = parseDurationSec(track.durationStr);
      const audioBuffer = await downloadYtAudio(track.youtubeVideoId);
      console.log(`   Downloaded ${audioBuffer.length} bytes. Uploading to Telegram...`);

      const tgRes = await uploadToTelegram(audioBuffer, track.title, track.artist, durSec);
      console.log(`   Uploaded! Telegram File ID: ${tgRes.fileId.slice(0, 15)}...`);

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
          tgRes.duration || durSec,
          tgRes.fileSize,
          tgRes.mimeType
        ]
      );

      cachedVideoIds.add(track.youtubeVideoId);
      cachedTitles.add(track.title.toLowerCase());
      successCount++;
      console.log(`   ✅ Successfully saved to Neon DB & Telegram: "${track.title}"!`);

      await new Promise(r => setTimeout(r, 1200));
    } catch (err) {
      console.error(`   ❌ Failed for ${track.title}:`, err.message);
      failedCount++;
    }
  }

  await client.end();
  console.log(`\n🎉 Ingestion Finished! Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
