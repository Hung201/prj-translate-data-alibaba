import { Sequelize, DataTypes } from 'sequelize';
import { dbConfig } from '../db.js'; // Import cấu hình kết nối

import PageModel from './Page.js'; // Import Page model definition
import ProductModel from './Product.js'; // Import Product model definition

const sequelize = new Sequelize(dbConfig.database, dbConfig.user, dbConfig.password, {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    logging: console.log, // Bật logging để xem các câu lệnh SQL được tạo ra
});

// Initialize models
const Page = PageModel(sequelize);
const Product = ProductModel(sequelize);

// Define associations
Page.hasMany(Product, {
    foreignKey: 'page_id',
    as: 'products'
});
Product.belongsTo(Page, {
    foreignKey: 'page_id',
    as: 'page'
});

// Đồng bộ model với database (chỉ chạy lần đầu hoặc khi thay đổi schema)
// async function syncDatabase() {
//   try {
//     await sequelize.sync();
//     console.log('Database synchronized!');
//   } catch (error) {
//     console.error('Error syncing database:', error);
//   }
// }
// syncDatabase();

export { sequelize, Page, Product }; 