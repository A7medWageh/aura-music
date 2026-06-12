import * as cheerio from 'cheerio';
async function test() {
  const res = await fetch('https://www.albumaty.com/song/12257.html');
  const html = await res.text();
  const $2 = cheerio.load(html);
  const mp3Link = $2('meta[property="og:audio"]').attr('content') || $2('audio source').attr('src') || $2('audio').attr('src');
  console.log("MP3 Link:", mp3Link);
}
test();
