const express = require('express');
const router = express.Router();
// Используем Cloudinary для production, локальное хранилище для разработки
const upload = process.env.NODE_ENV === 'production'
  ? require('../config/cloudinary')
  : require('../middleware/upload');
const { authMiddleware } = require('../middleware/auth');

// Загрузка одного изображения
router.post('/single', authMiddleware, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Файл не загружен' });
    }

    // Cloudinary возвращает URL в req.file.path, локальное хранилище требует конструирования URL
    const fileUrl = req.file.path || `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({
      success: true,
      url: fileUrl,
      file: req.file
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Загрузка нескольких изображений
router.post('/multiple', authMiddleware, upload.array('images', 10), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Файлы не загружены' });
    }

    // Cloudinary возвращает URL в file.path, локальное хранилище требует конструирования URL
    const fileUrls = req.files.map(file =>
      file.path || `${req.protocol}://${req.get('host')}/uploads/${file.filename}`
    );

    res.json({
      success: true,
      urls: fileUrls,
      files: req.files
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
