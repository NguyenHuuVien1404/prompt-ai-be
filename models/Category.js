const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Category = sequelize.define("Category", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    image: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    section_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Section, key: "id" } },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
});
Section.hasMany(Category, { foreignKey: "section_id" });
Category.belongsTo(Section, { foreignKey: "section_id" });
module.exports = Category;
