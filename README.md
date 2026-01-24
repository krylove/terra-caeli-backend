# Backend - Интернет-магазин ваз ручной работы

Backend часть интернет-магазина на Node.js + Express + MongoDB.

## Установка

```bash
npm install
```

## Настройка

1. Скопируйте `.env.example` в `.env`:
```bash
cp .env.example .env
```

2. Заполните переменные окружения в файле `.env`:
   - `MONGODB_URI` - строка подключения к MongoDB
   - `JWT_SECRET` - секретный ключ для JWT
   - `YOOKASSA_SHOP_ID` - ID магазина в ЮKassa
   - `YOOKASSA_SECRET_KEY` - секретный ключ ЮKassa
   - Email настройки для уведомлений

## Запуск

Разработка (с автоперезагрузкой):
```bash
npm run dev
```

Продакшн:
```bash
npm start
```

## API Endpoints

### Товары
- `GET /api/products` - Получить все товары
- `GET /api/products/:id` - Получить товар по ID
- `POST /api/products` - Создать товар (требуется авторизация)
- `PUT /api/products/:id` - Обновить товар (требуется авторизация)
- `DELETE /api/products/:id` - Удалить товар (требуется авторизация)

### Категории
- `GET /api/categories` - Получить все категории
- `GET /api/categories/:slug` - Получить категорию по slug
- `POST /api/categories` - Создать категорию (требуется авторизация)
- `PUT /api/categories/:id` - Обновить категорию (требуется авторизация)
- `DELETE /api/categories/:id` - Удалить категорию (требуется авторизация)

### Заказы
- `POST /api/orders` - Создать заказ
- `GET /api/orders/track/:orderNumber` - Отследить заказ
- `GET /api/orders` - Получить все заказы (требуется авторизация)
- `PUT /api/orders/:id/status` - Обновить статус заказа (требуется авторизация)

### Авторизация
- `POST /api/auth/register` - Регистрация первого админа
- `POST /api/auth/login` - Вход
- `GET /api/auth/verify` - Проверка токена

### Загрузка файлов
- `POST /api/upload/single` - Загрузить одно изображение
- `POST /api/upload/multiple` - Загрузить несколько изображений

## Первый запуск

При первом запуске создайте администратора:

```bash
POST /api/auth/register
{
  "username": "admin",
  "email": "admin@example.com",
  "password": "your-password"
}
```

После первой регистрации этот endpoint станет недоступен.

## Структура проекта

```
backend/
├── models/          # Mongoose модели
├── routes/          # Express маршруты
├── middleware/      # Middleware (auth, upload)
├── services/        # Сервисы (yookassa, email)
├── uploads/         # Загруженные изображения
├── server.js        # Точка входа
└── package.json
```

## Технологии

- **Express** - веб-фреймворк
- **MongoDB** + **Mongoose** - база данных
- **JWT** - аутентификация
- **Multer** - загрузка файлов
- **YooKassa** - прием платежей
- **Nodemailer** - отправка email
