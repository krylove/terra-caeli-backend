require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// CRITICAL: Проверка JWT_SECRET при старте
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ CRITICAL: JWT_SECRET должен быть минимум 32 символа!');
  console.error('   Установите надежный секрет в .env файле');
  process.exit(1);
}

// Проверка MongoDB URI
if (!process.env.MONGODB_URI) {
  console.error('❌ CRITICAL: MONGODB_URI не установлен!');
  process.exit(1);
}

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting - защита от DDoS и brute force
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP
  message: { success: false, message: 'Слишком много запросов, попробуйте позже' }
});
app.use('/api/', limiter);

// Строгий лимит для авторизации
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 10, // максимум 10 попыток входа в час
  message: { success: false, message: 'Слишком много попыток входа, попробуйте через час' }
});
app.use('/api/auth/login', authLimiter);

// Middleware
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : [];

const corsOptions = {
  origin: function (origin, callback) {
    // Разрешить запросы без origin (например, мобильные приложения или curl)
    if (!origin) return callback(null, true);

    // Если нет allowedOrigins, разрешить все
    if (allowedOrigins.length === 0) return callback(null, true);

    // Проверить, есть ли origin в списке разрешенных
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' })); // Лимит размера JSON
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Статическая папка для загруженных файлов
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Подключение к MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Подключено к MongoDB'))
  .catch(err => console.error('❌ Ошибка подключения к MongoDB:', err));

// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/upload', require('./routes/upload'));

// Базовый роут
app.get('/', (req, res) => {
  res.json({
    message: 'API интернет-магазина ваз ручной работы',
    version: '1.0.0',
    endpoints: {
      products: '/api/products',
      categories: '/api/categories',
      orders: '/api/orders',
      auth: '/api/auth',
      upload: '/api/upload'
    }
  });
});

// Обработка ошибок - не возвращаем внутренние сообщения клиенту
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  // В production не раскрываем детали ошибки
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    message: isProduction ? 'Внутренняя ошибка сервера' : err.message
  });
});

// Запуск сервера
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📡 API доступен по адресу: http://localhost:${PORT}`);
});

module.exports = app;
