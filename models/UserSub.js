const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./User");
const Subscription = require("./Subscription");

const UserSub = sequelize.define("UserSub", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: User, key: "id" } },
    sub_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Subscription, key: "id" } },
    status: { type: DataTypes.INTEGER, defaultValue: 1 },
    start_date: { type: DataTypes.DATE, allowNull: true },
    end_date: { type: DataTypes.DATE, allowNull: true },
}, {
    timestamps: false,
});

User.hasMany(UserSub, { foreignKey: "user_id", onDelete: "CASCADE" });
Subscription.hasMany(UserSub, { foreignKey: "sub_id", onDelete: "CASCADE" });
UserSub.belongsTo(User, { foreignKey: "user_id" });
UserSub.belongsTo(Subscription, { foreignKey: "sub_id" });

module.exports = UserSub;
