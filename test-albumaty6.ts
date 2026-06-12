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
  const titles = [
    "رامي صبري - اسمعني (Official Music Video)",
    "اسمعني رامي صبري",
    "Amr Diab Shokran",
    "Wegz El Bakht"
  ];
  
  for (let title of titles) {
    let queries = [];
    
    // Cleaned title
    let cleaned = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
    queries.push(cleaned);
    
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-').map(p => p.trim());
      queries.push(...parts);
    }
    
    // Split by spaces and take first 2 words if still not found
    const words = cleaned.split(' ');
    if (words.length > 2) {
      queries.push(words.slice(0, 2).join(' '));
      queries.push(words.slice(0, 1).join(' '));
    }
    
    console.log(`\nTesting: ${title}`);
    let found = false;
    for (const q of queries) {
      if (!q) continue;
      const link = await searchAlbumaty(q);
      if (link) {
        console.log(`Found using "${q}": ${link}`);
        found = true;
        break;
      }
    }
    if (!found) {
      console.log(`Not found for any queries.`);
    }
  }
}
run();
