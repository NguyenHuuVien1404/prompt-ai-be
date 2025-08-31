const express = require("express");
const router = express.Router();
const { Op, Sequelize } = require("sequelize");
const PromFavorite = require("../models/PromFavorite");
const Prompt = require("../models/Prompt");
const Section = require("../models/Section");
const Category = require("../models/Category");
const Topic = require("../models/Topic");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
router.get("/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const data = await PromFavorite.findAll({
      where: { user_id: userId },
    });

    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching prompt favorite",
      error: error.message,
    });
  }
});
router.post("/", async (req, res) => {
  try {
    const { user_id, prompt_id } = req.body;

    // Kiểm tra nếu dữ liệu cần thiết không tồn tại
    if (!user_id || !prompt_id) {
      return res
        .status(400)
        .json({ message: "user_id and prompt_id are required" });
    }

    // Thêm bản ghi mới vào PromFavorite
    const newFavorite = await PromFavorite.create({
      user_id,
      prompt_id,
    });

    res.status(201).json({
      message: "Prompt favorite added successfully",
      data: newFavorite,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error adding prompt favorite", error: error.message });
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params; // Lấy id từ URL parameter

    // Xóa bản ghi yêu thích tương ứng theo id
    const deleted = await PromFavorite.destroy({
      where: { id }, // Xóa theo id
    });

    if (deleted) {
      return res.status(200).json({
        message: "Prompt favorite deleted successfully",
      });
    } else {
      return res.status(404).json({ message: "Prompt favorite not found" });
    }
  } catch (error) {
    res.status(500).json({
      message: "Error deleting prompt favorite",
      error: error.message,
    });
  }
});
router.get("/list/by-section", async (req, res) => {
  try {
    const sectionId = req.query.section_id;
    const userId = req.query.user_id;

    if (!sectionId) {
      return res.status(400).json({ message: "section_id is required" });
    }

    let whereCondition;
    if (sectionId === "all") {
      whereCondition = {
        user_id: userId,
      };
    } else {
      whereCondition = {
        "$Prompt->Category.section_id$": sectionId,
        user_id: userId,
      };
    }

    const data = await PromFavorite.findAll({
      include: [
        {
          model: Prompt,
          include: [
            {
              model: Category,
              as: "Category", // Alias cho Category
              attributes: ["id", "name", "image", "image_card"],
              include: {
                model: Section,
                as: "Section", // Alias cho Section
                attributes: ["id", "name", "description"],
              },
            },
            {
              model: Topic,
              as: "topic", // Alias cho Topic
              attributes: ["id", "name"],
            },
          ],
        },
      ],
      where: whereCondition,
    });

    res.status(200).json({
      data: data,
    });
  } catch (error) {
    console.error("Error:", error); // Log lỗi nếu có
    res.status(500).json({
      message: "Error fetching favorite prompts",
      error: error.message,
    });
  }
});

module.exports = router;
