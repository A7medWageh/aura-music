// Aura Music 24/7 worker daemon (free, laptop-resident).
// Keeps three things alive: local Next server (:3000), a cloudflared tunnel to it,
// and the Neon system_config.tunnel_url pointer that production resolves through.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const ROOT = __dirname;
const PORT = 3000;
const LOCAL_HEALTH = `http://127.0.0.1:${PORT}/api/health`;
const PID_FILE = path.join(ROOT, "worker-daemon.pid");
const LOG_FILE = path.join(ROOT, "worker-daemon.log");
const SERVER_LOG = path.join(ROOT, "worker-server.log");
const DB_URL =
  "postgresql://neondb_owner:npg_afv7RLgh1oSF@ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require";
const CLOUDFLARED =
  [path.join(ROOT, "cloudflared.exe"), "C:/Program Files (x86)/cloudflared/cloudflared.exe"].find((p) =>
    fs.existsSync(p)
  ) || "cloudflared.exe";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  process.stdout.write(line);
}

// ─── Single instance ──────────────────────────────────────────────────────────
try {
  const old = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
  if (old && old !== process.pid) {
    try {
      process.kill(old, 0);
      log(`Daemon already running (pid ${old}); exiting.`);
      process.exit(0);
    } catch {}
  }
} catch {}
fs.writeFileSync(PID_FILE, String(process.pid));

// ─── Health probe ─────────────────────────────────────────────────────────────
async function httpOk(url, timeoutMs = 8000) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AuraMusic/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Next server ──────────────────────────────────────────────────────────────
let serverProc = null;
let serverFails = 0;
let serverSpawnedAt = 0;

function startServer() {
  if (serverProc && !serverProc.killed && serverProc.exitCode === null) return;
  log("Starting Next server on :" + PORT);
  // A fresh process needs time to boot ("Ready in ~45s"); without this grace the
  // health check in the same tick counted the old server's failures against it
  // and killed it seconds after spawning.
  serverFails = 0;
  serverSpawnedAt = Date.now();
  serverProc = spawn("npm", ["start"], { cwd: ROOT, shell: true, windowsHide: true });
  const sink = (data) => {
    try {
      fs.appendFileSync(SERVER_LOG, data.toString());
    } catch {}
  };
  serverProc.stdout.on("data", sink);
  serverProc.stderr.on("data", sink);
  serverProc.on("exit", (code) => {
    log(`Next server exited (code ${code}).`);
    serverProc = null;
    serverFails = 3;
  });
}

function serverBooting() {
  return Date.now() - serverSpawnedAt < 90000;
}

// ─── Cloudflare tunnel ────────────────────────────────────────────────────────
let tunnelProc = null;
let tunnelUrl = null;
let tunnelFails = 0;

function startTunnel() {
  if (tunnelProc && !tunnelProc.killed && tunnelProc.exitCode === null) return;
  log(`Starting cloudflared (${CLOUDFLARED})`);
  tunnelProc = spawn(CLOUDFLARED, ["tunnel", "--url", `http://localhost:${PORT}`], {
    cwd: ROOT,
    windowsHide: true,
  });
  tunnelUrl = null;
  const onChunk = (data) => {
    if (tunnelUrl) return;
    const m = data.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      tunnelUrl = m[0];
      log(`Tunnel URL: ${tunnelUrl}`);
      registerTunnel(tunnelUrl);
    }
  };
  tunnelProc.stderr.on("data", onChunk);
  tunnelProc.stdout.on("data", onChunk);
  tunnelProc.on("exit", (code) => {
    log(`cloudflared exited (code ${code}).`);
    tunnelProc = null;
    tunnelUrl = null;
    tunnelFails = 3;
  });
}

// ─── Register tunnel in Neon + broadcast on ntfy ─────────────────────────────
async function registerTunnel(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const client = new Client({ connectionString: DB_URL });
      await client.connect();
      await client.query(`CREATE TABLE IF NOT EXISTS system_config (key VARCHAR(50) PRIMARY KEY, value TEXT)`);
      await client.query(
        `INSERT INTO system_config (key, value) VALUES ('tunnel_url', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [url]
      );
      await client.end();
      log(`tunnel_url registered: ${url}`);
      break;
    } catch (e) {
      log(`DB register failed (attempt ${attempt}): ${e.message}`);
      if (attempt === 3) return;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  try {
    await fetch("https://ntfy.sh/aura_music_link_8472", {
      method: "POST",
      body: `Aura Music worker tunnel online: ${url}`,
      headers: { Title: "Aura Music Worker", Click: url, Tags: "headphones,rocket" },
      signal: AbortSignal.timeout(10000),
    });
  } catch {}
}

async function clearTunnelFromDb() {
  try {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    await client.query(`DELETE FROM system_config WHERE key = 'tunnel_url'`);
    await client.end();
    log("tunnel_url cleared from DB (tunnel died).");
  } catch (e) {
    log(`DB clear failed: ${e.message}`);
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────
let running = true;
async function tick() {
  if (!running) return;
  startServer();
  startTunnel();

  if (serverProc && serverBooting()) {
    // neither success nor failure while the boot is still in flight
  } else if (serverProc && (await httpOk(LOCAL_HEALTH))) serverFails = 0;
  else if (serverProc && ++serverFails >= 3) {
    log("Next server unhealthy 3x — restarting.");
    try {
      serverProc.kill();
    } catch {}
    serverProc = null;
    serverFails = 0;
  }

  if (tunnelProc && tunnelUrl) {
    if (serverBooting()) {
      // the tunnel answers 530 while its origin is still booting — that is not a dead tunnel
    } else if (await httpOk(`${tunnelUrl}/api/health`, 12000)) tunnelFails = 0;
    else if (++tunnelFails >= 3) {
      log("Tunnel unreachable 3x — restarting cloudflared.");
      tunnelFails = 0;
      try {
        tunnelProc.kill();
      } catch {}
      tunnelProc = null;
      await clearTunnelFromDb();
      startTunnel();
    }
  }

  setTimeout(tick, 40000);
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    log(`Received ${sig}, shutting down children.`);
    running = false;
    try { if (serverProc) serverProc.kill(); } catch {}
    try { if (tunnelProc) tunnelProc.kill(); } catch {}
    clearTunnelFromDb().finally(() => process.exit(0));
  });
}
process.on("uncaughtException", (e) => log("uncaught: " + e.message));
process.on("unhandledRejection", (e) => log("unhandled: " + (e && e.message)));

log("Worker daemon started (pid " + process.pid + ")");
// First tick immediately, then every 40s
tick();
