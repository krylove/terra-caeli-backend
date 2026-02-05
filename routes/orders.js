const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const Order = require('../models/Order');
const { authMiddleware } = require('../middleware/auth');
const { createPayment, checkPayment } = require('../services/yookassa');
const { sendOrderEmail } = require('../services/email');

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
  body('shipping.postalCode').trim().notEmpty().withMessage('Почтовый индекс обязателен'),
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

    // Вычисляем общую сумму
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Создаем заказ
    const order = new Order({
      items,
      customer,
      shipping,
      totalAmount,
      notes
    });

    await order.save();

    // Создаем платеж в ЮKassa
    const payment = await createPayment({
      amount: totalAmount,
      orderId: order._id.toString(),
      description: `Заказ ${order.orderNumber}`,
      customerEmail: customer.email
    });

    // Сохраняем ID платежа
    order.paymentId = payment.id;
    await order.save();

    // Отправляем email с подтверждением
    await sendOrderEmail(order);

    res.status(201).json({
      success: true,
      data: order,
      paymentUrl: payment.confirmation.confirmation_url
    });
  } catch (error) {
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
    const allowedPaymentStatuses = ['pending', 'paid', 'failed'];

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
    const { orderStatus } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { orderStatus, updatedAt: Date.now() },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Заказ не найден' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Webhook для обработки платежей от ЮKassa
// TODO: Добавить проверку подписи от ЮKassa для безопасности
router.post('/webhook/payment', async (req, res) => {
  try {
    const { object } = req.body;

    // Валидация входных данных
    if (!object || typeof object !== 'object' || !object.id || !object.status) {
      return res.status(400).json({ success: false, message: 'Invalid webhook data' });
    }

    // Защита от NoSQL injection - проверяем что paymentId строка
    const paymentId = sanitizeString(object.id);
    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'Invalid payment ID' });
    }

    if (object.status === 'succeeded') {
      const order = await Order.findOne({ paymentId });

      if (order) {
        order.paymentStatus = 'paid';
        order.orderStatus = 'processing';
        await order.save();
        console.log(`Платеж ${paymentId} успешен, заказ ${order.orderNumber} обновлён`);
      }
    } else if (object.status === 'canceled') {
      const order = await Order.findOne({ paymentId });

      if (order) {
        order.paymentStatus = 'failed';
        await order.save();
        console.log(`Платеж ${paymentId} отменён, заказ ${order.orderNumber} обновлён`);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
