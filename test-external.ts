import { getRedisClient } from "./apis/redis";

async function testCobalt() {
  const COBALT_APIS = [
    "https://cobalt-api.meowing.de",     // 88% score — best
    "https://capi.3kh0.net",             // 76% score
    "https://downloadapi.stuff.solutions", // 44% score — extra fallback
  ];

  for (const base of COBALT_APIS) {
    try {
      const res = await fetch(`${base}/`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          downloadMode: "audio",
          audioFormat: "mp3",
          audioBitrate: "128",
          filenameStyle: "basic",
          disableMetadata: true,
        }),
      });
      console.log(base, res.status, await res.text());
    } catch(e) {
      console.log(base, e.message);
    }
  }
}

async function testPiped() {
  const PIPED_APIS = [
    "https://api.piped.private.coffee",
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://piped-api.garudalinux.org",
    "https://api.piped.yt",
  ];
  for (const api of PIPED_APIS) {
    try {
      const res = await fetch(`${api}/streams/dQw4w9WgXcQ`, { headers: { "Accept": "application/json" } });
      console.log(api, res.status, (await res.text()).substring(0, 50));
    } catch(e) {
      console.log(api, e.message);
    }
  }
}

testCobalt().then(testPiped);
