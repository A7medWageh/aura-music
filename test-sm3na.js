const axios = require('axios');
const cheerio = require('cheerio');

async function testSm3na() {
  try {
    const query = "تملي معاك عمرو دياب";
    const searchUrl = `https://sm3na.com/search/${encodeURIComponent(query)}`;
    const searchRes = await axios.get(searchUrl, { headers: { "User-Agent": "Mozilla/5.0" }});
    const $ = cheerio.load(searchRes.data);
    
    const songs = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('/audio/')) {
        songs.push(href);
      }
    });
    
    console.log("Found links:", songs);
    
    if (songs.length > 0) {
      const songUrl = songs[0].startsWith('http') ? songs[0] : 'https://sm3na.com' + songs[0];
      const songRes = await axios.get(songUrl);
      const $song = cheerio.load(songRes.data);
      const mp3 = $song('audio source').attr('src') || $song('a[href$=".mp3"]').attr('href');
      console.log("MP3 URL:", mp3);
    }
  } catch(e) {
    console.log("Sm3na error:", e.message);
  }
}

testSm3na();
