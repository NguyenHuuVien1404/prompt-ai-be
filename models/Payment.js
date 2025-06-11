const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./User");
const Subscription = require("./Subscription");
const { duration } = require("moment");

const Payment = sequelize.define("Payment", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: "id" } },
    subscription_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Subscription, key: "id" } },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    coupon_id: { type: DataTypes.INTEGER, allowNull: true },
    payment_method: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    transaction_id: { type: DataTypes.STRING(255), unique: true, allowNull: true },
    payment_status: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    duration: {
        type: DataTypes.INTEGER,
    },
    orderId: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    payment_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    notes: { type: DataTypes.TEXT, allowNull: true },
}, {
    tableName: "payments",
    timestamps: false,
});

User.hasMany(Payment, { foreignKey: "user_id", onDelete: "CASCADE" });
Subscription.hasMany(Payment, { foreignKey: "subscription_id", onDelete: "CASCADE" });
Payment.belongsTo(User, { foreignKey: "user_id" });
Payment.belongsTo(Subscription, { foreignKey: "subscription_id" });

module.exports = Payment;
