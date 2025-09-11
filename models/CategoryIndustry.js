const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const CategoryIndustry = sequelize.define(
  "CategoryIndustry",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "categories",
        key: "id",
      },
    },
    industry_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "industries",
        key: "id",
      },
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "category_industries",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ["category_id", "industry_id"],
        name: "unique_category_industry",
      },
      {
        fields: ["category_id"],
        name: "idx_category_industries_category_id",
      },
      {
        fields: ["industry_id"],
        name: "idx_category_industries_industry_id",
      },
    ],
  }
);

// Định nghĩa associations
CategoryIndustry.associate = (models) => {
  // CategoryIndustry thuộc về một Category
  CategoryIndustry.belongsTo(models.Category, {
    foreignKey: "category_id",
    as: "category",
  });

  // CategoryIndustry thuộc về một Industry
  CategoryIndustry.belongsTo(models.Industry, {
    foreignKey: "industry_id",
    as: "industry",
  });
};

module.exports = CategoryIndustry;
