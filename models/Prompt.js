const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Category = require("./Category");

const Prompt = sequelize.define("Prompt", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    short_description: { type: DataTypes.STRING(500), allowNull: false },
    category_id: { type: DataTypes.INTEGER, references: { model: Category, key: "id" } },
    is_type: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: { type: DataTypes.INTEGER, defaultValue: 1 },
    views: { type: DataTypes.INTEGER, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
});

Category.hasMany(Prompt, { foreignKey: "category_id", onDelete: "SET NULL" });
Prompt.belongsTo(Category, { foreignKey: "category_id" });

module.exports = Prompt;
