const axios = require('axios');

async function testMyFreeMP3() {
  console.log("Testing MyFreeMP3...");
  try {
    const res = await axios.post("https://myfreemp3.to/api/search.php", "q=Amr+Diab+Tamally+Maak&page=0", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    console.log("MyFreeMP3 result length:", res.data.length);
  } catch(e) {
    console.log("MyFreeMP3 error:", e.message);
  }
}

async function testTubidy() {
  console.log("Testing Tubidy...");
  try {
    const res = await axios.get("https://tubidy.cool/search.php?q=amr+diab", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    console.log("Tubidy HTML length:", res.data.length);
  } catch(e) {
    console.log("Tubidy error:", e.message);
  }
}

testMyFreeMP3();
testTubidy();
