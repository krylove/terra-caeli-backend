const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

const DELIVERY_NAMES = {
  cdek_pvz: 'СДЭК ПВЗ',
  cdek_courier: 'СДЭК Курьер',
  post: 'Почта России'
}

/**
 * Отправить уведомление о новом заказе в Telegram
 * Fire-and-forget: ошибки логируются, но не блокируют процесс
 */
const sendOrderNotification = async (order) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log('Telegram not configured, skipping notification')
    return
  }

  try {
    const items = order.items
      .map(item => `• ${item.name} × ${item.quantity} — ${item.price.toLocaleString('ru-RU')} ₽`)
      .join('\n')

    const deliveryName = DELIVERY_NAMES[order.shipping?.method] || 'Не указан'
    const deliveryCost = order.shipping?.cost
      ? `${order.shipping.cost.toLocaleString('ru-RU')} ₽`
      : 'бесплатно'

    const address = order.shipping?.address || ''
    const city = order.shipping?.city || ''

    const text = `🛒 <b>Новый заказ #${order.orderNumber}</b>

👤 ${order.customer.firstName} ${order.customer.lastName}
📱 ${order.customer.phone}
📧 ${order.customer.email}

📦 ${deliveryName} → ${city}
🏠 ${address}

💰 <b>Итого: ${order.totalAmount.toLocaleString('ru-RU')} ₽</b> (доставка: ${deliveryCost})

${items}${order.notes ? `\n\n💬 ${order.notes}` : ''}`

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML'
      })
    })
  } catch (error) {
    console.error('Telegram notification error:', error.message)
  }
}

/**
 * Уведомление об оплате заказа
 */
const sendPaymentNotification = async (order) => {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return

  try {
    const text = `✅ <b>Оплата получена</b> — заказ #${order.orderNumber}\n💰 ${order.totalAmount.toLocaleString('ru-RU')} ₽`

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML'
      })
    })
  } catch (error) {
    console.error('Telegram payment notification error:', error.message)
  }
}

module.exports = { sendOrderNotification, sendPaymentNotification }
