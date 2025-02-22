const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Subscription = sequelize.define("Subscription", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name_sub: { type: DataTypes.STRING, allowNull: false },
    type: { type: DataTypes.INTEGER, defaultValue: 1 },
    duration: { type: DataTypes.INTEGER, defaultValue: 1 },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
});
module.exports = Subscription;
