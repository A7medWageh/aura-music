async function testSliderKz() {
  console.log("Testing Slider.kz...");
  try {
    const query = encodeURIComponent("Amr Diab Aalk Nedem");
    const res = await fetch(`https://slider.kz/vk_auth.php?q=${query}`);
    const data = await res.json();
    console.log("Slider API keys:", Object.keys(data));
    if (data.audios && data.audios[""] && data.audios[""].length > 0) {
      const song = data.audios[""][0];
      console.log("Found:", song.titie, song.url);
    } else {
      console.log("No results");
    }
  } catch(e) {
    console.log("Slider error:", e.message);
  }
}

testSliderKz();
