const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const { authMiddleware } = require('../middleware/auth');
const { sendOrderEmail, sendAdminNotification } = require('../services/email');
const { sendOrderNotification, sendPaymentNotification } = require('../services/telegram');

// Защита от NoSQL injection - проверка что значение строка
const sanitizeString = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

// Валидация заказа
const orderValidation = [
  body('items').isArray({ min: 1 }).withMessage('Корзина не может быть пустой'),
  body('items.*.name').trim().notEmpty().withMessage('Название товара обязательно'),
  body('items.*.price').isFloat({ min: 0 }).withMessage('Цена должна быть положительным числом'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Количество должно быть больше 0'),
  body('customer.firstName').trim().notEmpty().withMessage('Имя обязательно'),
  body('customer.lastName').trim().notEmpty().withMessage('Фамилия обязательна'),
  body('customer.email').isEmail().normalizeEmail().withMessage('Некорректный email'),
  body('customer.phone').trim().notEmpty().withMessage('Телефон обязателен'),
  body('shipping.address').trim().notEmpty().withMessage('Адрес обязателен'),
  body('shipping.city').trim().notEmpty().withMessage('Город обязателен'),
];

// Создать заказ
router.post('/', orderValidation, async (req, res) => {
  try {
    // Проверка валидации
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { items, customer, shipping, notes } = req.body;

    // Вычисляем общую сумму (товары + доставка)
    const itemsTotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shippingCost = Number(shipping.cost) || 0;
    const totalAmount = itemsTotal + shippingCost;

    // Создаем заказ
    const order = new Order({
      items,
      customer,
      shipping,
      totalAmount,
      notes
    });

    await order.save();

    // Уведомления (fire-and-forget — не блокируют ответ клиенту)
    sendOrderEmail(order).catch(err => console.error('Email error:', err.message));
    sendAdminNotification(order).catch(err => console.error('Admin email error:', err.message));
    sendOrderNotification(order).catch(err => console.error('Telegram error:', err.message));

    res.status(201).json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Получить заказ по номеру (для клиента)
router.get('/track/:orderNumber', async (req, res) => {
  try {
    // Защита от NoSQL injection - проверяем что orderNumber строка
    const orderNumber = sanitizeString(req.params.orderNumber);
    if (!orderNumber) {
      return res.status(400).json({ success: false, message: 'Некорректный номер заказа' });
    }

    const order = await Order.findOne({ orderNumber })
      .populate('items.product', 'name images');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Заказ не найден' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Получить все заказы (только для админа)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { status, paymentStatus, page = 1, limit = 20 } = req.query;
    let mongoQuery = {};

    // Защита от NoSQL injection - проверяем что параметры строки
    const allowedStatuses = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];
    const allowedPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'];

    if (status && typeof status === 'string' && allowedStatuses.includes(status)) {
      mongoQuery.orderStatus = status;
    }
    if (paymentStatus && typeof paymentStatus === 'string' && allowedPaymentStatuses.includes(paymentStatus)) {
      mongoQuery.paymentStatus = paymentStatus;
    }

    // Валидация пагинации
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

    const orders = await Order.find(mongoQuery)
      .populate('items.product', 'name images')
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const total = await Order.countDocuments(mongoQuery);

    res.json({
      success: true,
      data: orders,
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Обновить статус заказа (только для админа)
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;

    const updateData = { updatedAt: Date.now() };
    if (orderStatus) updateData.orderStatus = orderStatus;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Заказ не найден' });
    }

    // Telegram-уведомление при подтверждении оплаты
    if (paymentStatus === 'paid') {
      sendPaymentNotification(order).catch(err => console.error('Telegram payment error:', err.message));
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
