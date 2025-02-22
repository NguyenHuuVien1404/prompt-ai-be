const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Topic = sequelize.define(
  "Topic",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    timestamps: false,
    updatedAt: "updated_at",
    createdAt: "created_at",
    tableName: "topics"
  }
);
module.exports = Topic;
