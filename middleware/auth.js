const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  try {
    // Получаем токен из заголовка
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Нет токена авторизации' });
    }

    // Проверяем токен с указанием алгоритма (защита от algorithm substitution attack)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256']
    });
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Недействительный токен' });
  }
};

module.exports = { authMiddleware };
