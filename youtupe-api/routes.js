const express = require('express');
const router = express.Router();
const controller = require('./controller');

// مسار الـ API المشابه لخدمات RapidAPI
router.get('/download/mp3', controller.getAudioUrl);

module.exports = router;
