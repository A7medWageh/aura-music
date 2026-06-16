const axios = require('axios');
const cheerio = require('cheerio');

async function searchDDG(query) {
  try {
    const res = await axios.get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent('site:albumaty.com ' + query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });
    const $ = cheerio.load(res.data);
    let link = null;
    $('.result__url').each((i, el) => {
      const text = $(el).text().trim();
      if (!link && text.includes('albumaty.com/song/')) {
        link = 'https://' + text;
      }
    });
    return link;
  } catch (err) {
    console.error('DDG Error:', err.message);
    return null;
  }
}

async function run() {
  const link = await searchDDG('ramy sbri bad alfrak ma gnat');
  console.log('DDG Link for ramy sbri bad alfrak:', link);
  
  if (link) {
      const res = await axios.get(link);
      const $1 = cheerio.load(res.data);
      let mp3Link = null;
      $1('a').each((i, el) => {
          const href = $1(el).attr('href');
          if (href && href.includes('.mp3')) {
              mp3Link = href;
          }
      });
      console.log('MP3 Link:', mp3Link);
      console.log('Audio Source:', $1('audio source').attr('src') || $1('audio').attr('src'));
  }
}
run();
