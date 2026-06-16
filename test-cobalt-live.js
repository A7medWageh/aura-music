async function t() {
  try {
    const r = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', isAudioOnly: true, aFormat: 'mp3' })
    });
    console.log(r.status, await r.text());
  } catch (e) { console.error(e); }
}
t();
