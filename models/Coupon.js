const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Coupon = sequelize.define('Coupon', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    discount: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('percent', 'fixed'),
        defaultValue: 'percent'
    },
    expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    max_usage: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    usage_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'coupons',
    timestamps: false // Tắt tự động tạo updated_at
});

module.exports = Coupon; 