fetch('https://api.piped.private.coffee/streams/dQw4w9WgXcQ').then(r=>r.json()).then(d=>console.log(d.audioStreams[0].url))
