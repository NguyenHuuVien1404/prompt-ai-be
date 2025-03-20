const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Contact = sequelize.define("Contact", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    email: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    phone_number: {
        type: DataTypes.STRING(15),
        allowNull: true
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    status: {
        type: DataTypes.INTEGER,
        //defaultValue: 1 // 1 - Chưa trả lời, 2 - Đã trả lời
    },
    reply: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    type: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
}, {
    tableName: "contacts",
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
});

module.exports = Contact;