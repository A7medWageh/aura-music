const https = require('https');

https.get('https://aura-musiic.vercel.app/api/stream/dQw4w9WgXcQ', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', data);
  });
}).on('error', (e) => {
  console.error('Network Error:', e.message);
});
