const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Category = require("./Category");
const Topic = require("./Topic");

const Prompt = sequelize.define(
  "Prompt",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    short_description: { type: DataTypes.STRING(500), allowNull: false },
    category_id: {
      type: DataTypes.INTEGER,
      references: { model: Category, key: "id" },
    },
    is_type: { type: DataTypes.INTEGER, defaultValue: 1 },
    sub_type: { type: DataTypes.INTEGER, defaultValue: 1 },
    what: { type: DataTypes.TEXT, allowNull: true },
    tips: { type: DataTypes.TEXT, allowNull: true },
    text: { type: DataTypes.TEXT, allowNull: true },
    how: { type: DataTypes.TEXT, allowNull: true },
    input: { type: DataTypes.TEXT, allowNull: true },
    output: { type: DataTypes.TEXT, allowNull: true },
    OptimationGuide: { type: DataTypes.TEXT, allowNull: true },
    addtip: { type: DataTypes.TEXT, allowNull: true },
    addinformation: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    topic_id: {
      type: DataTypes.INTEGER,
      references: { model: Topic, key: "id" },
    },
    sum_view: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    tableName: "prompts",
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
  }
);

Category.hasMany(Prompt, { foreignKey: "category_id", onDelete: "SET NULL" });
Prompt.belongsTo(Category, { foreignKey: "category_id" });

Topic.hasMany(Prompt, { foreignKey: "topic_id", onDelete: "SET NULL" });
Prompt.belongsTo(Topic, { foreignKey: "topic_id" });

module.exports = Prompt;
