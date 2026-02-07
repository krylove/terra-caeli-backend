const nodemailer = require('nodemailer');

// Экранирование HTML для защиты от XSS
const escapeHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Настройка транспорта
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Отправка email о новом заказе
const sendOrderEmail = async (order) => {
  try {
    const itemsList = order.items.map(item =>
      `- ${escapeHtml(item.name)} x ${item.quantity} = ${(item.price * item.quantity).toFixed(2)} ₽`
    ).join('\n');

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: order.customer.email,
      subject: `Заказ ${escapeHtml(order.orderNumber)} принят`,
      html: `
        <h2>Спасибо за ваш заказ!</h2>
        <p>Здравствуйте, ${escapeHtml(order.customer.firstName)}!</p>
        <p>Ваш заказ <strong>${escapeHtml(order.orderNumber)}</strong> успешно оформлен.</p>

        <h3>Состав заказа:</h3>
        <pre>${itemsList}</pre>

        <h3>Сумма заказа: ${order.totalAmount.toFixed(2)} ₽</h3>

        <h3>Адрес доставки:</h3>
        <p>
          ${escapeHtml(order.shipping.address)}<br>
          ${escapeHtml(order.shipping.city)}, ${escapeHtml(order.shipping.postalCode)}<br>
          ${escapeHtml(order.shipping.country || 'Россия')}
        </p>

        <p>Мы свяжемся с вами в ближайшее время для уточнения деталей доставки.</p>

        <p>С уважением,<br>Команда интернет-магазина ваз</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email отправлен для заказа ${order.orderNumber}`);
  } catch (error) {
    console.error('Ошибка отправки email:', error);
  }
};

// Отправка уведомления админу о новом заказе
const sendAdminNotification = async (order) => {
  try {
    const itemsList = order.items.map(item =>
      `- ${escapeHtml(item.name)} x ${item.quantity} = ${(item.price * item.quantity).toFixed(2)} ₽`
    ).join('\n');

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_USER,
      subject: `Новый заказ ${escapeHtml(order.orderNumber)}`,
      html: `
        <h2>Получен новый заказ</h2>
        <p>Номер заказа: <strong>${escapeHtml(order.orderNumber)}</strong></p>

        <h3>Клиент:</h3>
        <p>
          ${escapeHtml(order.customer.firstName)} ${escapeHtml(order.customer.lastName)}<br>
          Email: ${escapeHtml(order.customer.email)}<br>
          Телефон: ${escapeHtml(order.customer.phone)}
        </p>

        <h3>Состав заказа:</h3>
        <pre>${itemsList}</pre>

        <h3>Сумма заказа: ${order.totalAmount.toFixed(2)} ₽</h3>

        <h3>Адрес доставки:</h3>
        <p>
          ${escapeHtml(order.shipping.address)}<br>
          ${escapeHtml(order.shipping.city)}, ${escapeHtml(order.shipping.postalCode)}<br>
          ${escapeHtml(order.shipping.country || 'Россия')}
        </p>

        ${order.notes ? `<h3>Комментарий:</h3><p>${escapeHtml(order.notes)}</p>` : ''}
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Ошибка отправки уведомления админу:', error);
  }
};

// Отправка ссылки на оплату клиенту
const sendPaymentLinkEmail = async (order) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: order.customer.email,
      subject: `Оплата заказа ${escapeHtml(order.orderNumber)} — Terra Caeli`,
      html: `
        <h2>Ссылка на оплату</h2>
        <p>Здравствуйте, ${escapeHtml(order.customer.firstName)}!</p>
        <p>Для оплаты заказа <strong>${escapeHtml(order.orderNumber)}</strong> на сумму <strong>${order.totalAmount.toFixed(2)} ₽</strong>, перейдите по ссылке:</p>

        <p style="margin: 24px 0;">
          <a href="${escapeHtml(order.paymentLink)}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
            Оплатить через СБП
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">Или скопируйте ссылку: ${escapeHtml(order.paymentLink)}</p>

        <p>С уважением,<br>Terra Caeli</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Payment link email sent for order ${order.orderNumber}`);
  } catch (error) {
    console.error('Ошибка отправки ссылки на оплату:', error);
  }
};

// Уведомление об отправке заказа
const sendShippedEmail = async (order) => {
  try {
    const DELIVERY_NAMES = {
      cdek_pvz: 'СДЭК (пункт выдачи)',
      cdek_courier: 'СДЭК (курьер)',
      post: 'Почта России'
    };
    const deliveryName = DELIVERY_NAMES[order.shipping?.method] || 'Служба доставки';

    const trackingInfo = order.trackingNumber
      ? `<p>Трек-номер для отслеживания: <strong>${escapeHtml(order.trackingNumber)}</strong></p>`
      : '';

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: order.customer.email,
      subject: `Заказ ${escapeHtml(order.orderNumber)} отправлен — Terra Caeli`,
      html: `
        <h2>Ваш заказ отправлен!</h2>
        <p>Здравствуйте, ${escapeHtml(order.customer.firstName)}!</p>
        <p>Заказ <strong>${escapeHtml(order.orderNumber)}</strong> передан в доставку.</p>

        <p>Способ доставки: <strong>${deliveryName}</strong></p>
        ${trackingInfo}

        <p>Адрес доставки: ${escapeHtml(order.shipping.city)}, ${escapeHtml(order.shipping.address)}</p>

        <p>С уважением,<br>Terra Caeli</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Shipped email sent for order ${order.orderNumber}`);
  } catch (error) {
    console.error('Ошибка отправки уведомления об отправке:', error);
  }
};

// Уведомление о доставке заказа
const sendDeliveredEmail = async (order) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: order.customer.email,
      subject: `Заказ ${escapeHtml(order.orderNumber)} доставлен — Terra Caeli`,
      html: `
        <h2>Заказ доставлен!</h2>
        <p>Здравствуйте, ${escapeHtml(order.customer.firstName)}!</p>
        <p>Заказ <strong>${escapeHtml(order.orderNumber)}</strong> успешно доставлен.</p>

        <p>Спасибо, что выбрали Terra Caeli! Будем рады видеть вас снова.</p>

        <p>С уважением,<br>Terra Caeli</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Delivered email sent for order ${order.orderNumber}`);
  } catch (error) {
    console.error('Ошибка отправки уведомления о доставке:', error);
  }
};

module.exports = {
  sendOrderEmail,
  sendAdminNotification,
  sendPaymentLinkEmail,
  sendShippedEmail,
  sendDeliveredEmail
};
