const PUBLIC_PIPED = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.yt",
  "https://piped-api.lunar.icu",
  "https://pipedapi.in.projectsegfau.lt",
  "https://piapi.ggtyler.dev",
  "https://api-piped.mha.fi",
  "https://piped-api.garudalinux.org"
];

async function testPiped() {
  for (const proxy of PUBLIC_PIPED) {
    try {
      const res = await fetch(`${proxy}/streams/CFvhCfVAY4c`, { headers: { "User-Agent": "Mozilla/5.0" }});
      if (res.ok) {
        const data = await res.json();
        const best = (data.audioStreams ?? []).filter((s: any) => s.url).sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
        if (best?.url) {
          console.log(`[SUCCESS] ${proxy} -> ${best.url}`);
        } else {
          console.log(`[FAILED] ${proxy} -> NO URL`);
        }
      } else {
        console.log(`[FAILED] ${proxy} -> HTTP ${res.status}`);
      }
    } catch (e: any) {
      console.log(`[ERROR] ${proxy} -> ${e.message}`);
    }
  }
}
testPiped();
