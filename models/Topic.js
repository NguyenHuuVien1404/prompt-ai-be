const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Prompt = require("./Prompt");
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
    });


module.exports = Topic;
