const axios = require('axios');
const cheerio = require('cheerio');

async function testVevioz() {
  try {
    const videoId = "MZiV1MijiBI";
    const res = await axios.get(`https://api.vevioz.com/api/button/mp3/${videoId}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    console.log("Vevioz Length:", res.data.length);
    const $ = cheerio.load(res.data);
    const link = $('a[href^="https://download"]').attr('href');
    console.log("Vevioz Link:", link);
  } catch(e) {
    console.log("Vevioz error:", e.message);
  }
}

testVevioz();
