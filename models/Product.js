const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Section = require("./Section");

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    link: {
        type: DataTypes.STRING,
        allowNull: false
    },
    image: {
        type: DataTypes.STRING, // Lưu đường dẫn đến ảnh
        allowNull: true
    },
    section_id: { type: DataTypes.INTEGER, references: { model: Section, key: "id" } },
}, {
    tableName: 'products',
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
});
module.exports = Product;
