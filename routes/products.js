const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const { authMiddleware } = require('../middleware/auth');

// Хелпер для скрытия ошибок в production
const getErrorMessage = (error) => {
  return process.env.NODE_ENV === 'production' ? 'Внутренняя ошибка сервера' : error.message;
};

// Валидация товара
const productValidation = [
  body('name').trim().notEmpty().withMessage('Название обязательно').isLength({ max: 200 }),
  body('description').optional().trim().isLength({ max: 5000 }),
  body('price').isFloat({ min: 0 }).withMessage('Цена должна быть положительным числом'),
  body('category').optional().isMongoId().withMessage('Некорректный ID категории'),
  body('images').optional().isArray(),
  body('inStock').optional().isBoolean(),
  body('featured').optional().isBoolean(),
  body('material').optional().trim().isLength({ max: 100 }),
];

// Получить все товары (с фильтрацией и поиском)
router.get('/', async (req, res) => {
  try {
    const { category, featured, inStock, sort, search } = req.query;
    let query = {};

    // Поиск по названию и описанию
    if (search && typeof search === 'string' && search.trim().length >= 2) {
      const searchRegex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [
        { name: searchRegex },
        { description: searchRegex }
      ];
    }

    if (category) query.category = category;
    if (featured) query.featured = featured === 'true';
    if (inStock) query.inStock = inStock === 'true';

    let sortOption = { createdAt: -1 };
    if (sort === 'price-asc') sortOption = { price: 1 };
    if (sort === 'price-desc') sortOption = { price: -1 };

    const products = await Product.find(query)
      .populate('category', 'name slug')
      .sort(sortOption);

    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

// Получить товар по ID
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug');

    if (!product) {
      return res.status(404).json({ success: false, message: 'Товар не найден' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

// Создать товар (только для админа)
router.post('/', authMiddleware, productValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const product = new Product(req.body);
    await product.save();

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

// Обновить товар (только для админа)
router.put('/:id', authMiddleware, productValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Товар не найден' });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(400).json({ success: false, message: getErrorMessage(error) });
  }
});

// Удалить товар (только для админа)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Товар не найден' });
    }

    res.json({ success: true, message: 'Товар удален' });
  } catch (error) {
    res.status(500).json({ success: false, message: getErrorMessage(error) });
  }
});

module.exports = router;
