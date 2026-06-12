async function testCobaltV7() {
  const url = "https://co.wuk.sh/";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=CFvhCfVAY4c",
        isAudioOnly: true,
        aFormat: "mp3"
      })
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", data);
  } catch (e) {
    console.error(e);
  }
}
testCobaltV7();
