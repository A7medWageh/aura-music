/**
 * Aura Music 24/7 Cloud Worker
 * ────────────────────────────
 * Designed for deployment on Railway / Render / Docker containers.
 * Replaces the laptop worker completely:
 * 1. Exposes /api/health for Railway health checks.
 * 2. Exposes /api/ytdownload to stream YouTube audio directly via yt-dlp.
 * 3. Handles ingestion and uploads directly to Telegram Cloud Storage.
 * 4. Auto-registers its public URL in Neon DB (system_config.tunnel_url) on boot,
 *    so Vercel instantly discovers and routes to it with zero manual config!
 */

const http = require("http");
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const PORT = parseInt(process.env.PORT || process.env.HF_PORT || "7860", 10);
const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_afv7RLgh1oSF@ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require";

const TELEGRAM_BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "8831422517:AAEXQFzQxzcyIKWI1WtfVh2XGzguGXAnCak";
const TELEGRAM_CHANNEL_ID =
  process.env.TELEGRAM_CHANNEL_ID || "-1004310944763";

function getYtDlpPath() {
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
    return process.env.YT_DLP_PATH;
  }
  const possiblePaths = [
    "/usr/local/bin/yt-dlp",
    "/usr/bin/yt-dlp",
    path.join(__dirname, "yt-dlp-master", "yt-dlp.exe"),
    path.join(__dirname, "yt-dlp-master", "yt-dlp.cmd"),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return "yt-dlp";
}

function checkYtDlp() {
  try {
    const res = spawnSync(getYtDlpPath(), ["--version"], { stdio: "pipe" });
    return res.status === 0;
  } catch {
    return false;
  }
}

// ── Auto-Registration with Neon DB ───────────────────────────────────────────
async function registerInNeonDb() {
  let publicUrl =
    process.env.PUBLIC_URL ||
    (process.env.SPACE_HOST ? `https://${process.env.SPACE_HOST}` : null) ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null) ||
    (process.env.RAILWAY_STATIC_URL ? `https://${process.env.RAILWAY_STATIC_URL}` : null) ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://aura-music-production.up.railway.app";

  publicUrl = publicUrl.replace(/\/$/, "");

  try {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    await client.query(
      `CREATE TABLE IF NOT EXISTS system_config (key VARCHAR(50) PRIMARY KEY, value TEXT)`
    );
    await client.query(
      `INSERT INTO system_config (key, value) VALUES ('tunnel_url', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [publicUrl]
    );
    await client.end();
    console.log(`[CloudWorker] Successfully registered worker URL in Neon DB: ${publicUrl}`);

    // Notify via ntfy
    try {
      await fetch("https://ntfy.sh/aura_music_link_8472", {
        method: "POST",
        body: `Aura Music Cloud Worker Online (Railway): ${publicUrl}`,
        headers: { Title: "Aura Cloud Worker Online", Click: publicUrl, Tags: "rocket,cloud" },
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  } catch (err) {
    console.warn("[CloudWorker] DB registration attempt:", err.message);
  }
}

// ── Ingest audio to Telegram & cache in DB ───────────────────────────────────
async function ingestToTelegram(videoId, title, artist) {
  const binary = getYtDlpPath();
  return new Promise((resolve, reject) => {
    const args = [
      "-f", "ba[ext=m4a]/ba[ext=mp3]/bestaudio/ba/b",
      "-o", "-",
      "--no-warnings",
      "--no-playlist",
      `https://www.youtube.com/watch?v=${videoId}`,
    ];

    const child = spawn(binary, args);
    const chunks = [];

    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", (err) => reject(err));
    child.on("close", async (code) => {
      if (code !== 0 || chunks.length === 0) {
        return reject(new Error(`yt-dlp extraction failed with code ${code}`));
      }

      const buffer = Buffer.concat(chunks);
      try {
        const formData = new FormData();
        formData.append("chat_id", TELEGRAM_CHANNEL_ID);
        formData.append(
          "audio",
          new Blob([buffer], { type: "audio/mp4" }),
          `${title || videoId}.m4a`
        );
        formData.append("title", title || "Aura Song");
        formData.append("performer", artist || "Aura Artist");

        const res = await fetch(
          `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendAudio`,
          {
            method: "POST",
            body: formData,
            signal: AbortSignal.timeout(30000),
          }
        );
        const data = await res.json();
        const media = data.ok ? data.result?.audio || data.result?.document : null;

        if (media && media.file_id) {
          const client = new Client({ connectionString: DB_URL });
          await client.connect();
          await client.query(
            `INSERT INTO telegram_audio_cache (video_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (tg_file_id) DO NOTHING`,
            [
              videoId,
              (title || "Aura Song").trim(),
              (artist || "Aura Artist").trim(),
              media.file_id,
              data.result.message_id || null,
              media.duration || null,
              media.file_size || buffer.length,
              media.mime_type || "audio/mp4",
            ]
          );
          await client.end();
          resolve({ ok: true, fileId: media.file_id });
        } else {
          reject(new Error("Telegram upload failed"));
        }
      } catch (uploadErr) {
        reject(uploadErr);
      }
    });
  });
}

// ── HTTP Request Handler ─────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const host = req.headers.host || `localhost:${PORT}`;
  const parsedUrl = new URL(req.url, `http://${host}`);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  // 1. Health check
  if (pathname === "/api/health" || pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        service: "aura-music-cloud-worker",
        status: "healthy",
        uptimeSec: Math.round(process.uptime()),
        ytDlpAvailable: checkYtDlp(),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // 2. Status page on root
  if (pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8">
        <title>Aura Music Cloud Worker</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0b0d14; color: #fff; text-align: center; padding: 50px 20px; }
          .card { max-width: 500px; margin: 0 auto; background: #161a29; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          h1 { color: #818cf8; margin-bottom: 8px; }
          .badge { display: inline-block; background: #10b98120; color: #34d399; padding: 6px 14px; border-radius: 20px; font-weight: bold; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🎧 Aura Music Cloud Worker</h1>
          <div class="badge">● متصل ويعمل 24/7 سحابياً</div>
          <p>السيرفر السحابي لمعالجة وسحب واستخراج الموسيقى في Aura Music يعمل بنجاح.</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // 3. Audio Streaming / Download: /api/ytdownload
  if (pathname === "/api/ytdownload" || pathname === "/ytdownload") {
    const videoId = searchParams.get("videoId");
    const title = searchParams.get("title") || videoId || "song";
    const artist = searchParams.get("artist") || "";
    const ingestNow = searchParams.get("ingestNow") === "true";

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "A valid videoId is required" }));
      return;
    }

    // Ingest-only request (Telegram cloud cache warm)
    if (ingestNow) {
      ingestToTelegram(videoId, title, artist)
        .then((r) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(r));
        })
        .catch((e) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        });
      return;
    }

    // Live audio stream
    const binary = getYtDlpPath();
    const args = [
      "-f", "ba[ext=m4a]/ba[ext=mp3]/bestaudio/ba/b",
      "-o", "-",
      "--no-warnings",
      "--no-playlist",
      "-q",
      `https://www.youtube.com/watch?v=${videoId}`,
    ];

    const child = spawn(binary, args);

    res.writeHead(200, {
      "Content-Type": "audio/mp4",
      "Cache-Control": "no-store",
      "Content-Disposition": "inline",
      "Accept-Ranges": "none",
    });

    child.stdout.pipe(res);

    child.on("error", (err) => {
      console.error("[CloudWorker] yt-dlp failed to spawn:", err.message);
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Audio extraction engine failed" }));
      }
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.warn(`[CloudWorker] yt-dlp exited with code ${code} for videoId=${videoId}`);
      }
    });

    req.on("close", () => {
      if (!res.writableEnded) {
        try { child.kill(); } catch {}
      }
    });

    // Also trigger background upload to Telegram so subsequent plays are instant!
    ingestToTelegram(videoId, title, artist).catch(() => {});
    return;
  }

  // 404 for other routes
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Route not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[CloudWorker] Aura Music Cloud Worker listening on port ${PORT}`);
  // Initial DB registration
  registerInNeonDb();
  // Keep alive & heartbeat in DB every 10 minutes
  setInterval(registerInNeonDb, 10 * 60 * 1000);
});
