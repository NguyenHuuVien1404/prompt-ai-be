const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Industry = sequelize.define(
  "Industry",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "industries",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Định nghĩa associations
Industry.associate = (models) => {
  // Một industry có thể có nhiều category_industries
  Industry.belongsToMany(models.Category, {
    through: models.CategoryIndustry,
    foreignKey: "industry_id",
    otherKey: "category_id",
    as: "categories",
  });
};

module.exports = Industry;
