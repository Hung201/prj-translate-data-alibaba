import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const Product = sequelize.define('Product', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        page_id: {
            type: DataTypes.INTEGER,
        },
        name: {
            type: DataTypes.STRING(250),
        },
        description: {
            type: DataTypes.TEXT,
        },
    }, {
        tableName: 'products', // Tên bảng trong database
        timestamps: false,
    });

    return Product;
}; 