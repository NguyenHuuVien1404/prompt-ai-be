const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Subscription = require("./Subscription");

const ContentSubscription = sequelize.define("ContentSubscription", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    content: { type: DataTypes.STRING, allowNull: false },
    subscription_id: { type: DataTypes.INTEGER, references: { model: Subscription, key: "id" } },
    included: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    tableName: "contentsubscriptions",
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
});

Subscription.hasMany(ContentSubscription, { foreignKey: "subscription_id", onDelete: "SET NULL" });
ContentSubscription.belongsTo(Subscription, { foreignKey: "subscription_id" });

module.exports = ContentSubscription;
