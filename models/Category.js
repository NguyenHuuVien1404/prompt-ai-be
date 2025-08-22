const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Section = require("./Section");

const Category = sequelize.define(
  "Category",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    image: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    image_card: { type: DataTypes.STRING(500), allowNull: false },
    section_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: Section, key: "id" },
    },
    type: {
      type: DataTypes.ENUM("free", "premium"),
      allowNull: false,
      defaultValue: "free",
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    is_comming_soon: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "categories",
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
  }
);
Section.hasMany(Category, { foreignKey: "section_id" });
Category.belongsTo(Section, { foreignKey: "section_id" });
module.exports = Category;
