const nodemailer = require('nodemailer');

// Настройка транспорта
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Отправка email о новом заказе
const sendOrderEmail = async (order) => {
  try {
    const itemsList = order.items.map(item =>
      `- ${item.name} x ${item.quantity} = ${(item.price * item.quantity).toFixed(2)} ₽`
    ).join('\n');

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: order.customer.email,
      subject: `Заказ ${order.orderNumber} принят`,
      html: `
        <h2>Спасибо за ваш заказ!</h2>
        <p>Здравствуйте, ${order.customer.firstName}!</p>
        <p>Ваш заказ <strong>${order.orderNumber}</strong> успешно оформлен.</p>

        <h3>Состав заказа:</h3>
        <pre>${itemsList}</pre>

        <h3>Сумма заказа: ${order.totalAmount.toFixed(2)} ₽</h3>

        <h3>Адрес доставки:</h3>
        <p>
          ${order.shipping.address}<br>
          ${order.shipping.city}, ${order.shipping.postalCode}<br>
          ${order.shipping.country}
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
      `- ${item.name} x ${item.quantity} = ${(item.price * item.quantity).toFixed(2)} ₽`
    ).join('\n');

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_USER,
      subject: `Новый заказ ${order.orderNumber}`,
      html: `
        <h2>Получен новый заказ</h2>
        <p>Номер заказа: <strong>${order.orderNumber}</strong></p>

        <h3>Клиент:</h3>
        <p>
          ${order.customer.firstName} ${order.customer.lastName}<br>
          Email: ${order.customer.email}<br>
          Телефон: ${order.customer.phone}
        </p>

        <h3>Состав заказа:</h3>
        <pre>${itemsList}</pre>

        <h3>Сумма заказа: ${order.totalAmount.toFixed(2)} ₽</h3>

        <h3>Адрес доставки:</h3>
        <p>
          ${order.shipping.address}<br>
          ${order.shipping.city}, ${order.shipping.postalCode}<br>
          ${order.shipping.country}
        </p>

        ${order.notes ? `<h3>Комментарий:</h3><p>${order.notes}</p>` : ''}
      `
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Ошибка отправки уведомления админу:', error);
  }
};

module.exports = {
  sendOrderEmail,
  sendAdminNotification
};
