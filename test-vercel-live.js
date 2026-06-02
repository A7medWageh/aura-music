const axios = require('axios');

async function testVercelApp() {
  const baseUrl = "https://aura-musiic.vercel.app";
  const endpoints = [
    { name: "Health Check", url: `${baseUrl}/api/health` },
    { name: "Trending Discovery", url: `${baseUrl}/api/discovery/trending` },
    { name: "Songs List", url: `${baseUrl}/api/songs` },
    { name: "Stream Resolution (Amr Diab)", url: `${baseUrl}/api/stream/MZiV1MijiBI?title=${encodeURIComponent("Tamally Maak")}&artist=${encodeURIComponent("Amr Diab")}` },
  ];

  for (const ep of endpoints) {
    console.log(`\nTesting ${ep.name} -> ${ep.url}`);
    try {
      const start = Date.now();
      const res = await axios.get(ep.url, { timeout: 15000 });
      const duration = Date.now() - start;
      console.log(`✅ Status: ${res.status} (Took ${duration}ms)`);
      
      let dataStr = typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data);
      console.log(`📦 Response: ${dataStr.substring(0, 200)}${dataStr.length > 200 ? '...' : ''}`);
      
    } catch (err) {
      if (err.response) {
        console.error(`❌ Error Status: ${err.response.status}`);
        console.error(`❌ Error Data:`, err.response.data);
      } else {
        console.error(`❌ Request Failed:`, err.message);
      }
    }
  }
}

testVercelApp();
