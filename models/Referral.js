const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/database"); // Import Sequelize instance

class Referral extends Model { }

Referral.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true, // Đảm bảo code không trùng lặp
        // Add index for faster lookups
        index: true,
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
        defaultValue: 1,
        // Add index for status filtering
        index: true,
    },
    endDate: {
        type: DataTypes.DATE, // Giá trị giảm giá, có thể là số thập phân
        allowNull: true,
        // Add index for date filtering
        index: true,
    }
}, {
    sequelize,
    modelName: 'Referral',
    tableName: "referrals",
    timestamps: true, // Thêm createdAt và updatedAt
    // Add indexes to improve search performance
    indexes: [
        {
            name: 'referral_code_idx',
            fields: ['code']
        },
        {
            name: 'referral_status_idx',
            fields: ['status']
        },
        {
            name: 'referral_enddate_idx',
            fields: ['endDate']
        }
    ]
});

module.exports = Referral;
