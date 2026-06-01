const axios = require('axios');

async function testSC() {
  const query = "Amr Diab Tamally Maak";
  console.log("Testing SoundCloud for:", query);
  
  // Public Client IDs
  const clientIds = [
    "iZIs9mchVcX5lhVRyQGGAYlNPVldzAoX",
    "2t9loNQH90kzJcsFCMnIe46qO980G9z8",
    "LBCcHmG3l5nB3sIXH2Vf5o1E71L8j3wY"
  ];
  
  for (const clientId of clientIds) {
    try {
      const searchUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${clientId}&limit=1`;
      const res = await axios.get(searchUrl);
      if (res.data.collection && res.data.collection.length > 0) {
        const track = res.data.collection[0];
        console.log("SC Found:", track.title);
        
        const trans = track.media.transcodings.find((t) => t.format.protocol === "progressive" || t.format.protocol === "hls");
        if (trans) {
          const streamRes = await axios.get(trans.url + `?client_id=${clientId}`);
          console.log("Stream URL:", streamRes.data.url);
          return;
        }
      }
    } catch(e) {
      console.log(`SC error for ${clientId}:`, e.message);
    }
  }
}

testSC();
