const axios = require('axios');
const cheerio = require('cheerio');

async function test(query) {
    const url = 'https://search.yahoo.com/search?p=site:albumaty.com ' + encodeURIComponent(query);
    console.log("Fetching:", url);
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }});
    const $ = cheerio.load(res.data);
    
    $('a').each((i, el) => {
        let href = $(el).attr('href');
        // Yahoo redirects are like: https://r.search.yahoo.com/_ylt=.../RU=https://www.albumaty.com/song/xxx.html/...
        if (href && href.includes('RU=')) {
            href = decodeURIComponent(href.split('RU=')[1].split('/')[0]);
        }
        if (href && href.includes('albumaty.com/song/')) {
            console.log("Found:", href, $(el).text());
        }
    });
}

test('ramy sbri bad alfrak');
