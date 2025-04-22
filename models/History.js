const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // Import kết nối Sequelize
const User = require("./User"); // Import User để làm khóa ngoại


const History = sequelize.define(
    "History",
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        request: {
            type: DataTypes.TEXT("long"),
            allowNull: true,
        },
        respone: {
            type: DataTypes.TEXT("long"),
            allowNull: true,
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
    },
    {
        tableName: "histories",
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
    }
);
History.belongsTo(User, {
    foreignKey: "user_id",
    as: "user", // Định danh alias để dùng trong truy vấn
});
module.exports = History;
