const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Prompt = require("./Prompt");
const Industry = require("./Industry");

const PromptIndustry = sequelize.define(
  "PromptIndustry",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
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
    industry_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: Industry,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "prompt_industries",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["prompt_id", "industry_id"],
        name: "unique_prompt_industry",
      },
    ],
  }
);

module.exports = PromptIndustry;
