const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // Import Sequelize instance

const Referral = sequelize.define("Referral", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true, // Đảm bảo code không trùng lặp
    },
    discount: {
        type: DataTypes.FLOAT, // Giá trị giảm giá, có thể là số thập phân
        allowNull: false,
    },
    count: {
        type: DataTypes.INTEGER, // Giá trị giảm giá, có thể là số thập phân
        allowNull: false,
        defaultValue: 1
    },
    status: {
        type: DataTypes.INTEGER, // Giá trị giảm giá, có thể là số thập phân
        allowNull: false,
        defaultValue: 1
    },
    endDate: {
        type: DataTypes.DATE, // Giá trị giảm giá, có thể là số thập phân
        allowNull: true,
    }
}, {
    tableName: "referrals",
    timestamps: true, // Thêm createdAt và updatedAt
});

module.exports = Referral;
