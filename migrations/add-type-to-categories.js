const { DataTypes } = require("sequelize");

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("categories", "type", {
      type: DataTypes.ENUM("free", "premium"),
      allowNull: false,
      defaultValue: "free",
      after: "section_id",
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("categories", "type");
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_categories_type;"
    );
  },
};
