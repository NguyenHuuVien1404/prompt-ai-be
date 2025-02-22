const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Prompts = require("./Prompt");

const Topic = sequelize.define("Topic", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
});

Topic.associate = (models) => {
    Topic.hasMany(models.Prompt, {
        foreignKey: "topic_id",
        onDelete: "SET NULL",
    });
};
Topic.hasMany(Prompts, { foreignKey: "topic_id" });
module.exports = Topic;

