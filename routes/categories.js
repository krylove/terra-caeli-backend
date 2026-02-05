const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const { authMiddleware } = require('../middleware/auth');

// Хелпер для скрытия ошибок в production
const getErrorMessage = (error) => {
  return process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : error.message;
};

// Валидация категории
const categoryValidation = [
  body('name').trim().notEmpty().withMessage('Название обязательно').isLength({ max: 100 }),
  body('slug').optional().trim().isLength({ max: 100 }).matches(/^[a-z0-9-]+$/).withMessage('Slug может содержать только a-z, 0-9 и -'),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('image').optional().trim().isURL().withMessage('Некорректный URL изображения'),
  body('order').optional().isInt({ min: 0 }),
];

// Получить все категории
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find().sort({ order: 1 });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

// Получить категорию по slug
router.get('/:slug', async (req, res) => {
  try {
    // Защита от NoSQL injection - проверяем что slug строка
    const slug = typeof req.params.slug === 'string' ? req.params.slug.trim() : '';
    if (!slug || slug.length > 100) {
      return res.status(400).json({ success: false, message: 'Некорректный slug' });
    }

    const category = await Category.findOne({ slug });

    if (!category) {
      return res.status(404).json({ success: false, message: 'Категория не найдена' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

// Создать категорию (только для админа)
router.post('/', authMiddleware, categoryValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const category = new Category(req.body);
    await category.save();

    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

// Обновить категорию (только для админа)
router.put('/:id', authMiddleware, categoryValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!category) {
      return res.status(404).json({ success: false, message: 'Категория не найдена' });
    }

    res.json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

// Удалить категорию (только для админа)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({ success: false, message: 'Категория не найдена' });
    }

    res.json({ success: true, message: 'Категория удалена' });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

module.exports = router;
