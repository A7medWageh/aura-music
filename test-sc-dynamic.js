const axios = require('axios');

async function testSC() {
  console.log("Fetching dynamic SC client_id...");
  const htmlRes = await axios.get("https://soundcloud.com", { headers: { "User-Agent": "Mozilla/5.0" }});
  const html = htmlRes.data;
  
  // Find JS files
  const regex = /<script crossorigin src="([^"]+)"><\/script>/g;
  let match;
  let clientId = null;
  
  while ((match = regex.exec(html)) !== null) {
    const src = match[1];
    try {
      const jsRes = await axios.get(src);
      const js = jsRes.data;
      const clientMatch = js.match(/client_id:"([^"]+)"/);
      if (clientMatch) {
        clientId = clientMatch[1];
        console.log("Found Client ID:", clientId);
        break;
      }
    } catch(e) {}
  }
  
  if (!clientId) {
    console.log("Could not find client ID");
    return;
  }
  
  const query = "Amr Diab Tamally Maak";
  console.log("Searching SC with client ID...");
  const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=3`;
  const res = await axios.get(searchUrl);
  
  if (res.data.collection && res.data.collection.length > 0) {
    const track = res.data.collection[0];
    console.log("Found track:", track.title);
    const trans = track.media.transcodings.find((t) => t.format.protocol === "progressive" || t.format.protocol === "hls");
    if (trans) {
      const streamRes = await axios.get(trans.url + `?client_id=${clientId}`);
      console.log("Stream URL:", streamRes.data.url);
    }
  } else {
    console.log("No track found");
  }
}

testSC();
