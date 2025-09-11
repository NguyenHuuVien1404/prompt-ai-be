const { DataTypes } = require("sequelize");

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Tạo bảng industries
    await queryInterface.createTable("industries", {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
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
    });

    // Tạo bảng category_industries
    await queryInterface.createTable("category_industries", {
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
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      industry_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "industries",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    // Thêm unique constraint cho category_id và industry_id
    await queryInterface.addConstraint("category_industries", {
      fields: ["category_id", "industry_id"],
      type: "unique",
      name: "unique_category_industry",
    });

    // Thêm indexes để tối ưu performance
    await queryInterface.addIndex("category_industries", ["category_id"]);
    await queryInterface.addIndex("category_industries", ["industry_id"]);
    await queryInterface.addIndex("industries", ["name"]);
  },

  down: async (queryInterface, Sequelize) => {
    // Xóa bảng category_industries trước (do có foreign key)
    await queryInterface.dropTable("category_industries");

    // Xóa bảng industries
    await queryInterface.dropTable("industries");
  },
};
