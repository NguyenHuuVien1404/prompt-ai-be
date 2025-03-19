const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // Đảm bảo bạn đã có kết nối Sequelize
const Prompt = require("./Prompt");

const PromDetails = sequelize.define('PromDetails', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    text: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    image: {
        type: DataTypes.STRING, // Lưu đường dẫn đến ảnh
        allowNull: true
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    type: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1 //1 là card ảnh, 2 là example variable
    },
    prompt_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: Prompt,
            key: "id",
        },
        onDelete: "CASCADE",
    },
}, {
    tableName: 'prom_details',
    timestamps: true
});



module.exports = PromDetails;
