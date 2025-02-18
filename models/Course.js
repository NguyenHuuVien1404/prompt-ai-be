const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Course = sequelize.define('Course', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    title: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    short_description: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    is_premium: {
        type: DataTypes.INTEGER,
        defaultValue: 1 // 1 - Free, 2 - Premium, 3 - Plus
    },
    status: {
        type: DataTypes.INTEGER,
        defaultValue: 1 // 1 - nháp, 2 - đã xuất bản, 3 - đã lưu trữ
    },
    views: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        onUpdate: DataTypes.NOW
    }
}, {
    tableName: 'courses',
    timestamps: false
});

module.exports = Course;
