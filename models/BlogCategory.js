const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // Import kết nối Sequelize

const BlogCategory = sequelize.define(
    "BlogCategory",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        description: {
            type: DataTypes.TEXT,
        },
        slug: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
    },
    {
        tableName: "blog_categories",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    }
);

module.exports = BlogCategory;
