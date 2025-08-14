const { DataTypes } = require("sequelize");
const sequelize = require("../config/database"); // Import kết nối Sequelize
const User = require("./User"); // Import User để làm khóa ngoại
const BlogCategory = require("./BlogCategory"); // Import BlogCategory để làm khóa ngoại

const Blog = sequelize.define(
  "Blog",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },

    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: BlogCategory,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    published_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    meta_description: {
      type: DataTypes.STRING(255),
    },
    featured_image: {
      type: DataTypes.TEXT,
    },
  },
  {
    tableName: "blogs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);
Blog.belongsTo(BlogCategory, {
  foreignKey: "category_id",
  as: "category", // Định danh alias để dùng trong truy vấn
});
module.exports = Blog;
