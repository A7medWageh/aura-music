const youtubedl = require('youtube-dl-exec');
console.log('Fetching info...');
youtubedl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true
}).then(info => console.log('Success:', info.title))
  .catch(err => console.error('Error:', err));
