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
const {
  sendListResponse,
  sendDetailResponse,
  sendCreateResponse,
  sendUpdateResponse,
  sendDeleteResponse,
  sendErrorResponse,
  sendNotFoundResponse,
  sendInternalErrorResponse,
  calculatePagination,
} = require("../utils/responseUtils");

// Import transform utilities
const { transformToCamelCase } = require("../utils/transformUtils");
router.get("/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const data = await PromFavorite.findAll({
      where: { user_id: userId },
    });

    sendListResponse(
      res,
      transformToCamelCase(data),
      calculatePagination(data.length, 1, data.length)
    );
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Error fetching prompt favorite: " + error.message
    );
  }
});
router.post("/", async (req, res) => {
  try {
    const { user_id, prompt_id } = req.body;

    // Kiểm tra nếu dữ liệu cần thiết không tồn tại
    if (!user_id || !prompt_id) {
      return sendErrorResponse(
        res,
        "user_id and prompt_id are required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Thêm bản ghi mới vào PromFavorite
    const newFavorite = await PromFavorite.create({
      user_id,
      prompt_id,
    });

    sendCreateResponse(
      res,
      transformToCamelCase(newFavorite),
      "Prompt favorite added successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Error adding prompt favorite: " + error.message
    );
  }
});
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params; // Lấy id từ URL parameter

    // Kiểm tra xem bản ghi có tồn tại không
    const favorite = await PromFavorite.findByPk(id);
    if (!favorite) {
      return sendNotFoundResponse(res, "Prompt favorite not found");
    }

    // Xóa bản ghi yêu thích tương ứng theo id
    await PromFavorite.destroy({
      where: { id }, // Xóa theo id
    });

    sendDeleteResponse(res, "Prompt favorite deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Error deleting prompt favorite: " + error.message
    );
  }
});
router.get("/list/by-section", async (req, res) => {
  try {
    const sectionId = req.query.section_id;
    const userId = req.query.user_id;

    if (!sectionId) {
      return sendErrorResponse(
        res,
        "section_id is required",
        "VALIDATION_ERROR",
        400
      );
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

    sendListResponse(
      res,
      transformToCamelCase(data),
      calculatePagination(data.length, 1, data.length)
    );
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Error fetching favorite prompts: " + error.message
    );
  }
});

module.exports = router;
