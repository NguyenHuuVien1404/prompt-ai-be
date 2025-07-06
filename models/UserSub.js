const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const User = require("./User");
const Subscription = require("./Subscription");

const UserSub = sequelize.define("UserSub", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: User, key: "id" },
        onDelete: "CASCADE" // Thêm onDelete để kiểm soát hành vi xóa
    },
    sub_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: Subscription, key: "id" },
        onDelete: "CASCADE" // Thêm onDelete để kiểm soát hành vi xóa
    },
    status: { type: DataTypes.INTEGER, defaultValue: 1 }, //1- Hoạt động 2- Không hoạt động
    start_date: { type: DataTypes.DATE, allowNull: true },
    end_date: { type: DataTypes.DATE, allowNull: true },
    token: { type: DataTypes.INTEGER, defaultValue: 0 }, // Số token còn lại cho gói token
}, {
    tableName: "usersubs",
    timestamps: false,
});

// Loại bỏ các quan hệ dư thừa
// User.hasMany(UserSub, { foreignKey: "user_id", onDelete: "CASCADE" });
// Subscription.hasMany(UserSub, { foreignKey: "sub_id", onDelete: "CASCADE" });
// UserSub.belongsTo(User, { foreignKey: "user_id" });
// UserSub.belongsTo(Subscription, { foreignKey: "sub_id" });

module.exports = UserSub;