const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const { authMiddleware } = require('../middleware/auth');
const { createPayment, checkPayment } = require('../services/sberbank');
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

    // Создаем платеж в Сбербанке
    const frontendUrl = (process.env.FRONTEND_URL || 'https://terracaeli.ru').split(',')[0].trim();
    const returnUrl = `${frontendUrl}/order-success/${order.orderNumber}`;

    const payment = await createPayment({
      amount: totalAmount,
      orderId: order.orderNumber,
      description: `Заказ ${order.orderNumber} — Terra Caeli`,
      returnUrl
    });

    // Сохраняем ID платежа Сбербанка
    order.paymentId = payment.orderId;
    await order.save();

    // Уведомления (fire-and-forget — не блокируют ответ клиенту)
    sendOrderEmail(order).catch(err => console.error('Email error:', err.message));
    sendAdminNotification(order).catch(err => console.error('Admin email error:', err.message));
    sendOrderNotification(order).catch(err => console.error('Telegram error:', err.message));

    res.status(201).json({
      success: true,
      data: order,
      paymentUrl: payment.formUrl
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Верификация платежа (вызывается фронтендом после возврата со страницы оплаты)
router.get('/verify-payment/:orderNumber', async (req, res) => {
  try {
    const orderNumber = sanitizeString(req.params.orderNumber);
    if (!orderNumber) {
      return res.status(400).json({ success: false, message: 'Некорректный номер заказа' });
    }

    const order = await Order.findOne({ orderNumber });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Заказ не найден' });
    }

    // Если платёж уже обработан — возвращаем текущий статус
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'failed') {
      return res.json({ success: true, data: { paymentStatus: order.paymentStatus, orderStatus: order.orderStatus } });
    }

    // Проверяем статус в Сбербанке
    if (!order.paymentId) {
      return res.json({ success: true, data: { paymentStatus: order.paymentStatus, orderStatus: order.orderStatus } });
    }

    const paymentInfo = await checkPayment(order.paymentId);

    // Статусы Сбербанка: 0=создан, 1=предавторизован, 2=оплачен, 3=отменён, 4=возврат, 6=отклонён
    if (paymentInfo.orderStatus === 2) {
      order.paymentStatus = 'paid';
      order.orderStatus = 'processing';
      await order.save();
      console.log(`Платёж подтверждён, заказ ${order.orderNumber} оплачен`);

      // Уведомление об оплате
      sendPaymentNotification(order).catch(err => console.error('Telegram payment error:', err.message));
    } else if (paymentInfo.orderStatus === 3 || paymentInfo.orderStatus === 6) {
      order.paymentStatus = 'failed';
      await order.save();
      console.log(`Платёж отклонён, заказ ${order.orderNumber}`);
    }

    res.json({
      success: true,
      data: {
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus
      }
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({ success: false, message: 'Ошибка проверки платежа' });
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

// Webhook для Сбербанка (callback URL настраивается в ЛК СберБизнес)
router.post('/webhook/payment', async (req, res) => {
  try {
    const { mdOrder, orderNumber, operation, status } = req.body;

    if (!mdOrder) {
      return res.status(400).json({ success: false, message: 'Invalid webhook data' });
    }

    const sberbankOrderId = sanitizeString(mdOrder);
    if (!sberbankOrderId) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    // Верифицируем статус платежа через API Сбербанка
    const paymentInfo = await checkPayment(sberbankOrderId);

    const order = await Order.findOne({ paymentId: sberbankOrderId });
    if (!order) {
      console.error(`Webhook: заказ с paymentId ${sberbankOrderId} не найден`);
      return res.json({ success: true });
    }

    if (paymentInfo.orderStatus === 2) {
      order.paymentStatus = 'paid';
      order.orderStatus = 'processing';
      await order.save();
      console.log(`Webhook: заказ ${order.orderNumber} оплачен`);

      sendPaymentNotification(order).catch(err => console.error('Telegram payment error:', err.message));
    } else if (paymentInfo.orderStatus === 3 || paymentInfo.orderStatus === 6) {
      order.paymentStatus = 'failed';
      await order.save();
      console.log(`Webhook: заказ ${order.orderNumber} — платёж отклонён`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;
