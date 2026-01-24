const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authMiddleware } = require('../middleware/auth');
const { createPayment, checkPayment } = require('../services/yookassa');
const { sendOrderEmail } = require('../services/email');

// Создать заказ
router.post('/', async (req, res) => {
  try {
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
    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
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
    let query = {};

    if (status) query.orderStatus = status;
    if (paymentStatus) query.paymentStatus = paymentStatus;

    const orders = await Order.find(query)
      .populate('items.product', 'name images')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      data: orders,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit)
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
router.post('/webhook/payment', async (req, res) => {
  try {
    const { object } = req.body;

    if (object.status === 'succeeded') {
      const order = await Order.findOne({ paymentId: object.id });

      if (order) {
        order.paymentStatus = 'paid';
        order.orderStatus = 'processing';
        await order.save();
      }
    } else if (object.status === 'canceled') {
      const order = await Order.findOne({ paymentId: object.id });

      if (order) {
        order.paymentStatus = 'failed';
        await order.save();
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
