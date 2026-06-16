const axios = require('axios');
const cheerio = require('cheerio');

async function test(query) {
    console.log("Fetching DDG Lite for:", query);
    const res = await axios.post('https://lite.duckduckgo.com/lite/', 'q=' + encodeURIComponent('site:albumaty.com ' + query), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
    });
    const $ = cheerio.load(res.data);
    
    // .result-url or td.result-snippet
    $('a').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (href && href.includes('albumaty.com')) {
            console.log("Albumaty URL:", href, text);
        }
    });
}

test(process.argv[2] || 'ramy sbri bad alfrak');
