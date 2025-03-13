const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // Đảm bảo bạn đã có kết nối Sequelize
const User = require("./User");
const Prompt = require("./Prompt");

const PromFavorite = sequelize.define("PromFavorite", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: "id",
        },
        onDelete: "CASCADE",
    },
    prompt_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Prompt,
            key: "id",
        },
        onDelete: "CASCADE",
    },
}, {
    tableName: "promfavorite",
    timestamps: false, // Không cần createdAt, updatedAt nếu không dùng
});



module.exports = PromFavorite;
