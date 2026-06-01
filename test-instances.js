async function testInstances() {
  const videoId = "MZiV1MijiBI";
  
  const piped = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://piped-api.garudalinux.org",
    "https://api.piped.yt",
    "https://pipedapi.kescher.at",
    "https://piped.video/api",
    "https://api.piped.projectsegfau.lt",
    "https://piped-api.lunar.icu"
  ];
  
  for(const api of piped) {
    try {
      const start = Date.now();
      const res = await fetch(`${api}/streams/${videoId}`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if(data.audioStreams?.length > 0) {
        console.log(`[PIPED] ${api} OK! (${Date.now()-start}ms) -> ${data.audioStreams[0].url.substring(0,30)}`);
      }
    } catch(e) { console.log(`[PIPED] ${api} failed`); }
  }

  const invidious = [
    "https://invidious.flokinet.to",
    "https://invidious.projectsegfau.lt",
    "https://iv.ggtyler.dev",
    "https://invidious.privacydev.net",
    "https://invidious.nerdvpn.de",
    "https://inv.nadeko.net",
    "https://invidious.fdn.fr",
    "https://invidious.perennialte.ch"
  ];

  for(const api of invidious) {
    try {
      const start = Date.now();
      const res = await fetch(`${api}/api/v1/videos/${videoId}`, { signal: AbortSignal.timeout(5000) });
      const data = await res.json();
      if(data.adaptiveFormats?.length > 0) {
        console.log(`[INV] ${api} OK! (${Date.now()-start}ms)`);
      }
    } catch(e) { console.log(`[INV] ${api} failed`); }
  }
}

testInstances();
