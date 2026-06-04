const instances = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piped-api.garudalinux.org",
  "https://api.piped.yt",
  "https://pipedapi.kescher.at",
  "https://piped.video/api",
];

async function testInstances() {
  for (const api of instances) {
    console.log(`Testing ${api}...`);
    try {
      const res = await fetch(`${api}/trending?region=EG`);
      console.log(`${api} status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log(`${api} returned ${data.length} items.`);
      }
    } catch (e) {
      console.log(`${api} error: ${e.message}`);
    }
  }
}

testInstances();
