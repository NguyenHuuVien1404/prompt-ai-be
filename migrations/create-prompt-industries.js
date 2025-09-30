const { DataTypes } = require("sequelize");

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Kiểm tra xem bảng đã tồn tại chưa
    const tableExists = await queryInterface
      .showAllTables()
      .then((tables) => tables.includes("prompt_industries"));

    if (!tableExists) {
      await queryInterface.createTable("prompt_industries", {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
        },
        prompt_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: "prompts",
            key: "id",
          },
          onDelete: "CASCADE",
        },
        industry_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: "industries",
            key: "id",
          },
          onDelete: "CASCADE",
        },
        created_at: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
        },
      });
    }

    // Kiểm tra xem index đã tồn tại chưa
    try {
      await queryInterface.addIndex("prompt_industries", {
        fields: ["prompt_id", "industry_id"],
        unique: true,
        name: "unique_prompt_industry",
      });
    } catch (error) {
      if (
        error.name === "SequelizeDatabaseError" &&
        error.original.code === "ER_DUP_KEYNAME"
      ) {
        console.log(
          "Index 'unique_prompt_industry' already exists, skipping..."
        );
      } else {
        throw error;
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("prompt_industries");
  },
};
