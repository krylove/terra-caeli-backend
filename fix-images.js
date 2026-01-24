require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const fixImageUrls = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Подключено к MongoDB');

    const products = await Product.find({});
    console.log(`📦 Найдено товаров: ${products.length}`);

    for (const product of products) {
      let needsUpdate = false;
      const updatedImages = product.images.map(img => {
        if (img.startsWith('/uploads/')) {
          needsUpdate = true;
          return `http://localhost:5001${img}`;
        }
        return img;
      });

      if (needsUpdate) {
        product.images = updatedImages;
        await product.save();
        console.log(`✅ Обновлен товар: ${product.name}`);
      }
    }

    console.log('✅ Готово!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
};

fixImageUrls();
