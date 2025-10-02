const express = require("express");
const router = express.Router();
const Topic = require("../models/Topic");
const { Sequelize, Op } = require("sequelize");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const { adminOrMarketerMiddleware } = require("../middleware/roleMiddleware");
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
// Lấy danh sách chủ đề
router.get("/", authMiddleware, adminOrMarketerMiddleware, async (req, res) => {
  try {
    let {
      page,
      pageIndex,
      pageSize = 10,
      searchTerm,
      dateFrom,
      dateTo,
    } = req.query;
    const currentPage = parseInt(page || pageIndex || 1);
    pageSize = parseInt(pageSize);
    const offset = (currentPage - 1) * pageSize;
    const limit = pageSize;

    // Build where condition for filtering
    const whereCondition = {};

    // Handle search filtering
    if (searchTerm && searchTerm.trim() !== "") {
      whereCondition[Op.or] = [
        { name: { [Op.like]: `%${searchTerm.trim()}%` } },
        { name: { [Op.like]: `%${searchTerm.trim().toLowerCase()}%` } },
        { name: { [Op.like]: `%${searchTerm.trim().toUpperCase()}%` } },
      ];
    }

    // Handle date filtering - filter by createdAt OR updatedAt
    if (dateFrom || dateTo) {
      const dateConditions = [];

      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        if (!isNaN(fromDate.getTime())) {
          // Set to start of day
          fromDate.setHours(0, 0, 0, 0);
          dateConditions.push({
            [Op.or]: [
              { createdAt: { [Op.gte]: fromDate } },
              { updatedAt: { [Op.gte]: fromDate } },
            ],
          });
        }
      }

      if (dateTo) {
        const toDate = new Date(dateTo);
        if (!isNaN(toDate.getTime())) {
          // Set to end of day
          toDate.setHours(23, 59, 59, 999);
          dateConditions.push({
            [Op.or]: [
              { createdAt: { [Op.lte]: toDate } },
              { updatedAt: { [Op.lte]: toDate } },
            ],
          });
        }
      }

      if (dateConditions.length > 0) {
        whereCondition[Op.and] = dateConditions;
      }
    }

    const { count, rows } = await Topic.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    const pagination = calculatePagination(count, currentPage, pageSize);
    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy chủ đề theo ID
router.get(
  "/:id",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const topic = await Topic.findByPk(req.params.id);
      if (!topic) return sendNotFoundResponse(res, "Không tìm thấy chủ đề");
      sendDetailResponse(res, transformToCamelCase(topic));
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Thêm chủ đề mới
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    const topic = await Topic.create({ name, description });
    sendCreateResponse(
      res,
      transformToCamelCase(topic),
      "Topic created successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Cập nhật chủ đề
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const topic = await Topic.findByPk(req.params.id);
    if (!topic) return sendNotFoundResponse(res, "Không tìm thấy chủ đề");

    await topic.update({ name });
    sendUpdateResponse(
      res,
      transformToCamelCase(topic),
      "Topic updated successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Xóa chủ đề
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const topic = await Topic.findByPk(req.params.id);
    if (!topic) return sendNotFoundResponse(res, "Không tìm thấy chủ đề");

    await topic.destroy();
    sendDeleteResponse(res, "Topic deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

module.exports = router;
