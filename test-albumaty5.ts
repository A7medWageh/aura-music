import * as cheerio from 'cheerio';

async function searchAlbumaty(query: string) {
  const res = await fetch('https://www.albumaty.com/search.php?q=' + encodeURIComponent(query));
  const html = await res.text();
  const $ = cheerio.load(html);
  let link = null;
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (!link && href && href.includes('/song/')) link = href;
  });
  return link;
}

async function run() {
  const ytTitle = "رامي صبري - اسمعني (Official Music Video)";
  const artist = "رامي صبري";
  
  let queries = [];
  queries.push(`${ytTitle} ${artist}`.trim());
  queries.push(ytTitle.trim());
  
  // Cleaned title
  let cleaned = ytTitle.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
  queries.push(cleaned);
  
  if (cleaned.includes('-')) {
    const parts = cleaned.split('-').map(p => p.trim());
    queries.push(...parts);
  }

  for (const q of queries) {
    if (!q) continue;
    console.log(`Trying: "${q}"`);
    const link = await searchAlbumaty(q);
    if (link) {
      console.log(`Found! ${link}`);
      break;
    }
  }
}
run();
