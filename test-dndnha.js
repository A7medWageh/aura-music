const axios = require('axios');
const cheerio = require('cheerio');

async function testDndnha() {
  try {
    const query = "عمرو دياب تملي معاك";
    console.log("Searching Dndnha for:", query);
    
    // dndnha or sm3na or similar
    const searchUrl = `https://dndnha.mobi/search?q=${encodeURIComponent(query)}`;
    const searchRes = await axios.get(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    
    const $ = cheerio.load(searchRes.data);
    const firstSong = $('.track-item a.track-title').first().attr('href');
    
    if (firstSong) {
      console.log("Found song page:", firstSong);
      const songRes = await axios.get(firstSong);
      const $song = cheerio.load(songRes.data);
      const downloadLink = $song('a.download-btn').attr('href') || $song('audio source').attr('src');
      console.log("Download link:", downloadLink);
    } else {
      console.log("No song found on dndnha");
    }
  } catch(e) {
    console.log("Dndnha error:", e.message);
  }
}

async function testSm3na() {
  try {
    const query = "تملي معاك";
    const searchUrl = `https://sm3na.com/search/${encodeURIComponent(query)}`;
    const searchRes = await axios.get(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" }});
    console.log("Sm3na HTML length:", searchRes.data.length);
  } catch(e) {
    console.log("Sm3na error:", e.message);
  }
}

testDndnha();
testSm3na();
