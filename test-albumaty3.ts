import * as cheerio from 'cheerio';
import * as fs from 'fs';

async function test() {
  const q = encodeURIComponent('عمرو دياب');
  const res = await fetch('https://www.albumaty.com/search.php?q=' + q);
  const html = await res.text();
  fs.writeFileSync('output2.html', html);
  console.log('Saved to output2.html');
}
test();
