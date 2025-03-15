const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Section = sequelize.define("Section", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
    tableName: "sections",
    timestamps: true,
    updatedAt: "updated_at",
    createdAt: "created_at",
});

module.exports = Section;
