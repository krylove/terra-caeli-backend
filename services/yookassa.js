let YooCheckout;
let checkout;

// Динамическая загрузка SDK
const getCheckout = async () => {
  if (!checkout) {
    const sdk = await import('@yookassa/sdk');
    YooCheckout = sdk.YooCheckout;
    checkout = new YooCheckout({
      shopId: process.env.YOOKASSA_SHOP_ID,
      secretKey: process.env.YOOKASSA_SECRET_KEY
    });
  }
  return checkout;
};

// Создание платежа
const createPayment = async ({ amount, orderId, description, customerEmail }) => {
  try {
    const checkoutInstance = await getCheckout();
    const payment = await checkoutInstance.createPayment({
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      },
      confirmation: {
        type: 'redirect',
        return_url: `${process.env.FRONTEND_URL}/order/success?orderId=${orderId}`
      },
      capture: true,
      description,
      receipt: {
        customer: {
          email: customerEmail
        },
        items: [{
          description,
          quantity: '1.00',
          amount: {
            value: amount.toFixed(2),
            currency: 'RUB'
          },
          vat_code: 1
        }]
      },
      metadata: {
        orderId
      }
    });

    return payment;
  } catch (error) {
    console.error('Ошибка создания платежа:', error);
    throw new Error('Не удалось создать платеж');
  }
};

// Проверка статуса платежа
const checkPayment = async (paymentId) => {
  try {
    const checkoutInstance = await getCheckout();
    const payment = await checkoutInstance.getPayment(paymentId);
    return payment;
  } catch (error) {
    console.error('Ошибка проверки платежа:', error);
    throw new Error('Не удалось проверить платеж');
  }
};

// Возврат платежа
const refundPayment = async (paymentId, amount) => {
  try {
    const checkoutInstance = await getCheckout();
    const refund = await checkoutInstance.createRefund({
      payment_id: paymentId,
      amount: {
        value: amount.toFixed(2),
        currency: 'RUB'
      }
    });

    return refund;
  } catch (error) {
    console.error('Ошибка возврата платежа:', error);
    throw new Error('Не удалось оформить возврат');
  }
};

module.exports = {
  createPayment,
  checkPayment,
  refundPayment
};
