const SBER_API_URL = process.env.SBER_API_URL || 'https://3dsec.sberbank.ru'
const SBER_LOGIN = process.env.SBER_MERCHANT_LOGIN
const SBER_PASSWORD = process.env.SBER_MERCHANT_PASSWORD

/**
 * Вызов API Сбербанка
 */
const sberRequest = async (endpoint, params) => {
  const url = `${SBER_API_URL}/payment/rest/${endpoint}`

  const body = new URLSearchParams({
    userName: SBER_LOGIN,
    password: SBER_PASSWORD,
    ...params
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  const data = await response.json()

  if (data.errorCode && data.errorCode !== '0') {
    const error = new Error(data.errorMessage || 'Sberbank API error')
    error.code = data.errorCode
    throw error
  }

  return data
}

/**
 * Создание платежа (register.do)
 * amount — сумма в рублях (будет конвертирована в копейки)
 * orderId — номер заказа в нашей системе
 * description — описание заказа
 * returnUrl — URL возврата после оплаты
 */
const createPayment = async ({ amount, orderId, description, returnUrl }) => {
  const data = await sberRequest('register.do', {
    orderNumber: orderId,
    amount: Math.round(amount * 100), // рубли → копейки
    returnUrl,
    failUrl: returnUrl, // при ошибке тоже возвращаем на ту же страницу
    description: description || `Заказ ${orderId}`,
    language: 'ru',
    jsonParams: JSON.stringify({
      email: '', // будет передан отдельно если нужно
    })
  })

  return {
    orderId: data.orderId, // ID заказа в системе Сбербанка
    formUrl: data.formUrl   // URL платёжной формы для редиректа
  }
}

/**
 * Проверка статуса платежа (getOrderStatusExtended.do)
 * Статусы: 0=создан, 1=предавторизован, 2=оплачен, 3=отменён, 4=возврат, 6=отклонён
 */
const checkPayment = async (sberbankOrderId) => {
  const data = await sberRequest('getOrderStatusExtended.do', {
    orderId: sberbankOrderId
  })

  return {
    orderStatus: data.orderStatus, // числовой статус
    actionCode: data.actionCode,   // код результата (0 = успех)
    amount: data.amount / 100,     // копейки → рубли
    currency: data.currency,
    ip: data.ip,
    cardholderName: data.cardAuthInfo?.cardholderName,
    pan: data.cardAuthInfo?.pan, // маскированный номер карты
    raw: data
  }
}

/**
 * Возврат платежа (refund.do)
 * amount — сумма возврата в рублях (если не указана — полный возврат)
 */
const refundPayment = async (sberbankOrderId, amount) => {
  const params = { orderId: sberbankOrderId }
  if (amount) {
    params.amount = Math.round(amount * 100)
  }

  return await sberRequest('refund.do', params)
}

module.exports = { createPayment, checkPayment, refundPayment }
