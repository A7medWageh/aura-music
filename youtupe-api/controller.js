const youtubedl = require('youtube-dl-exec');

const getAudioUrl = async (req, res) => {
    try {
        const videoUrl = req.query.url;
        console.log('API Hit! Received request for URL:', videoUrl);
        
        if (!videoUrl) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }

        // Fetch video info as JSON without downloading
        console.log('Fetching info from YouTube...');
        const info = await youtubedl(videoUrl, {
            dumpSingleJson: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            youtubeSkipDashManifest: true
        });

        // Filter for audio-only formats
        const formats = info.formats || [];
        const audioFormats = formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
        
        if (audioFormats.length === 0) {
            return res.status(404).json({ success: false, error: 'No audio formats found' });
        }

        // Sort audio formats by abr (average bitrate) highest first
        audioFormats.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
        
        const bestFormat = audioFormats[0];

        // Format the response
        const responseData = {
            success: true,
            id: info.id,
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration,
            download_url: bestFormat.url,
            quality: (bestFormat.abr || bestFormat.format_note || 'Unknown') + 'kbps',
            ext: bestFormat.ext,
            size_bytes: bestFormat.filesize || bestFormat.filesize_approx || 'Unknown'
        };

        res.json(responseData);

    } catch (error) {
        console.error('Error fetching video info:', error.message);
        res.status(500).json({ success: false, error: 'Failed to extract video info' });
    }
};

module.exports = {
    getAudioUrl
};
