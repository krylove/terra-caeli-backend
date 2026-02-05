const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const Admin = require('../models/Admin');
const { authMiddleware } = require('../middleware/auth');

// Хелпер для скрытия ошибок в production
const getErrorMessage = (error) => {
  return process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : error.message;
};

// Валидация логина
const loginValidation = [
  body('username').trim().notEmpty().withMessage('Имя пользователя обязательно'),
  body('password').notEmpty().withMessage('Пароль обязателен'),
];

// Валидация регистрации
const registerValidation = [
  body('username').trim().notEmpty().isLength({ min: 3, max: 50 }).withMessage('Имя пользователя 3-50 символов'),
  body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
  body('password').isLength({ min: 8 }).withMessage('Пароль минимум 8 символов')
    .matches(/[A-Z]/).withMessage('Пароль должен содержать заглавную букву')
    .matches(/[0-9]/).withMessage('Пароль должен содержать цифру'),
];

// Вход для админа
router.post('/login', loginValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

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

    // Создаем JWT токен с указанием алгоритма
    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
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
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

// Регистрация первого админа (только если нет других)
router.post('/register', registerValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

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

    // Создаем токен с указанием алгоритма
    const token = jwt.sign(
      { id: admin._id, username: admin.username, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d', algorithm: 'HS256' }
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
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

// Проверка токена
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    res.json({ success: true, admin });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

module.exports = router;
