const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client } = require('pg');

const desktopPath = path.join(os.homedir(), 'Desktop', 'Aura_Music_Link.txt');
fs.writeFileSync(desktopPath, 'Starting Aura Music Server... Please wait. (This usually takes a few seconds)');

// 1. Start Next.js
const nextjs = spawn('npm', ['start'], {
  cwd: __dirname,
  shell: true
});

// 2. Start Cloudflare Tunnel
const tunnel = spawn('cloudflared.exe', ['tunnel', '--url', 'http://localhost:3000'], {
  cwd: __dirname,
  shell: true
});

let urlFound = false;

tunnel.stderr.on('data', async (data) => {
  const output = data.toString();
  if (!urlFound) {
    fs.appendFileSync(desktopPath, "\n" + output);
  }
  const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match) {
    urlFound = true;
    const url = match[0];
    
    // Update the link in the database
    try {
      const client = new Client({
        connectionString: 'postgresql://neondb_owner:npg_afv7RLgh1oSF@ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require'
      });
      await client.connect();
      // Ensure table exists
      await client.query(`CREATE TABLE IF NOT EXISTS system_config (key VARCHAR(50) PRIMARY KEY, value TEXT)`);
      // Update URL
      await client.query(`INSERT INTO system_config (key, value) VALUES ('tunnel_url', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [url]);
      await client.end();
      
      const content = `🎧 Aura Music Server is RUNNING! 🎧\n\n🔗 Your Fixed Link is:\nhttps://aura-musiic.vercel.app\n\n(It will automatically redirect to your laptop's new URL: ${url})\nGenerated at: ${new Date().toLocaleString()}`;
      fs.writeFileSync(desktopPath, content);

      // Also broadcast to ntfy
      try {
        await fetch('https://ntfy.sh/aura_music_link_8472', {
          method: 'POST',
          body: `Aura Music Tunnel Online: ${url}`,
          headers: {
            Title: 'Aura Music Tunnel',
            Click: url,
            Tags: 'headphones,rocket'
          }
        });
      } catch {}
    } catch (e) {
      fs.writeFileSync(desktopPath, `Server running, but failed to update database: ${e.message}\nDirect URL: ${url}`);
    }
  }
});
