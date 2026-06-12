const http = require('http');

http.get('http://localhost:3000/api/download?videoId=kJQP7kiw5Fk', (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  
  let size = 0;
  res.on('data', (chunk) => {
    size += chunk.length;
  });
  
  res.on('end', () => {
    console.log(`Total downloaded size: ${size} bytes`);
    process.exit(0);
  });
}).on('error', (e) => {
  console.error(`Got error: ${e.message}`);
  process.exit(1);
});
