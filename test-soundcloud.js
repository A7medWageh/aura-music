const https = require('https');

async function getSoundcloudClientId() {
  try {
    const res = await fetch("https://soundcloud.com");
    const html = await res.text();
    const scripts = html.match(/<script crossorigin src="([^"]+)"><\/script>/g);
    for (const script of scripts) {
      const src = script.match(/src="([^"]+)"/)[1];
      const jsRes = await fetch(src);
      const js = await jsRes.text();
      const clientIdMatch = js.match(/client_id:"([^"]+)"/);
      if (clientIdMatch) {
        return clientIdMatch[1];
      }
    }
  } catch (e) {
    console.log("Error getting SC client id:", e);
  }
  return "2t9loNQH90kzJcsFCMnIe46qO980G9z8"; // A commonly known working one just in case
}

async function testSoundcloud() {
  const clientId = await getSoundcloudClientId();
  console.log("Client ID:", clientId);
  
  const query = "Amr Diab Aalk Nedem";
  console.log("Searching SoundCloud for:", query);
  
  const res = await fetch(`https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=1`);
  const data = await res.json();
  
  if (data.collection && data.collection.length > 0) {
    const track = data.collection[0];
    console.log("Found:", track.title, track.user.username);
    const trans = track.media.transcodings.find(t => t.format.protocol === "progressive");
    if (trans) {
      const streamRes = await fetch(trans.url + `?client_id=${clientId}`);
      const streamData = await streamRes.json();
      console.log("Stream URL:", streamData.url);
    } else {
      console.log("No progressive stream found");
    }
  } else {
    console.log("No tracks found");
  }
}

testSoundcloud();
