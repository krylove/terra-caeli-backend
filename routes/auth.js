const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const { authMiddleware } = require('../middleware/auth');

// Вход для админа
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Находим админа
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Неверные учетные данные' });
    }

    // Проверяем пароль
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Неверные учетные данные' });
    }

    // Создаем JWT токен
    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Регистрация первого админа (только если нет других)
router.post('/register', async (req, res) => {
  try {
    // Проверяем, есть ли уже админы
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
      return res.status(403).json({
        success: false,
        message: 'Регистрация закрыта. Используйте существующего администратора.'
      });
    }

    const { username, email, password } = req.body;

    // Создаем первого супер-админа
    const admin = new Admin({
      username,
      email,
      password,
      role: 'super-admin'
    });

    await admin.save();

    // Создаем токен
    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Проверка токена
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    res.json({ success: true, admin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
