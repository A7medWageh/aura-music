import * as cheerio from 'cheerio';

async function searchDDG(query: string) {
  const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent('site:albumaty.com ' + query), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  let link = null;
  $('.result__url').each((i, el) => {
    const text = $(el).text().trim();
    if (!link && text.includes('albumaty.com/song/')) {
      link = 'https://' + text;
    }
  });
  return link;
}

async function run() {
  const link = await searchDDG('رامي صبري اسمعني');
  console.log('DDG Link:', link);
}
run();
