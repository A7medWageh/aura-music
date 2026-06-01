const axios = require('axios');
const cheerio = require('cheerio');

async function testTubidyScraper() {
  console.log("Testing Tubidy Scraper...");
  try {
    const query = "Amr Diab Tamally Maak";
    const res = await axios.get(`https://tubidy.cool/search.php?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    
    const $ = cheerio.load(res.data);
    const firstResult = $('.media a').first().attr('href');
    
    if (firstResult) {
      console.log("Found song page:", firstResult);
      // Navigate to song page
      const songUrl = firstResult.startsWith('http') ? firstResult : `https://tubidy.cool${firstResult}`;
      const songRes = await axios.get(songUrl, { headers: { "User-Agent": "Mozilla/5.0" }});
      const $song = cheerio.load(songRes.data);
      
      // Find MP3 audio download link
      // Tubidy usually has links like /download.php?id=...
      let mp3Link = null;
      $song('a').each((i, el) => {
        const text = $song(el).text().toLowerCase();
        const href = $song(el).attr('href');
        if (text.includes('mp3') && href) {
          mp3Link = href;
        }
      });
      console.log("MP3 Link found:", mp3Link);
      
      if (mp3Link) {
        const finalUrl = mp3Link.startsWith('http') ? mp3Link : `https://tubidy.cool${mp3Link}`;
        const finalRes = await axios.get(finalUrl, { headers: { "User-Agent": "Mozilla/5.0" }});
        const $final = cheerio.load(finalRes.data);
        
        let directMp3 = null;
        $final('audio source').each((i, el) => {
            if ($final(el).attr('src')) directMp3 = $final(el).attr('src');
        });
        
        if (!directMp3) {
            $final('a').each((i, el) => {
                const text = $final(el).text().toLowerCase();
                const href = $final(el).attr('href');
                if ((text.includes('download') || text.includes('play')) && href && href.includes('.mp3')) {
                    directMp3 = href;
                }
            });
        }
        
        console.log("Direct MP3:", directMp3);
      }
      
    } else {
      console.log("No results found.");
    }
  } catch(e) {
    console.log("Tubidy error:", e.message);
  }
}

testTubidyScraper();
