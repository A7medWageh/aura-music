const axios = require('axios');

async function testJioSaavnInstances() {
  const instances = [
    "https://saavn.dev",
    "https://jiosaavn-api-privatecvc2.vercel.app",
    "https://jiosaavn-api-v3.vercel.app"
  ];

  for (const url of instances) {
    console.log(`Testing ${url}...`);
    try {
      const start = Date.now();
      const res = await axios.get(`${url}/api/search/songs?query=Amr+Diab`, { timeout: 4000 });
      console.log(`✅ ${url} worked in ${Date.now() - start}ms`);
    } catch(e) {
      console.log(`❌ ${url} failed: ${e.message}`);
    }
  }
}

testJioSaavnInstances();
