const ytdl = require('@distube/ytdl-core');

const getAudioUrl = async (req, res) => {
    try {
        const videoUrl = req.query.url;
        console.log('API Hit! Received request for URL:', videoUrl);
        
        if (!videoUrl) {
            return res.status(400).json({ success: false, error: 'URL is required' });
        }

        console.log('Fetching info from YouTube via ytdl-core...');
        const info = await ytdl.getInfo(videoUrl);

        // Filter for audio-only formats
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        
        if (audioFormats.length === 0) {
            return res.status(404).json({ success: false, error: 'No audio formats found' });
        }

        // Sort audio formats by highest audio bitrate
        audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
        
        const bestFormat = audioFormats[0];

        // Format the response
        const responseData = {
            success: true,
            id: info.videoDetails.videoId,
            title: info.videoDetails.title,
            thumbnail: info.videoDetails.thumbnails[0]?.url,
            duration: info.videoDetails.lengthSeconds,
            download_url: bestFormat.url,
            quality: (bestFormat.audioBitrate || 'Unknown') + 'kbps',
            ext: bestFormat.container || 'mp3',
            size_bytes: bestFormat.contentLength || 'Unknown'
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
