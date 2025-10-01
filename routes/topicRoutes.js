const express = require("express");
const router = express.Router();
const Topic = require("../models/Topic");
const { Sequelize } = require("sequelize");
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
// Lấy danh sách chủ đề
router.get("/", async (req, res) => {
  try {
    const topics = await Topic.findAll();
    sendListResponse(
      res,
      transformToCamelCase(topics),
      calculatePagination(topics.length, 1, topics.length)
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy danh sách chủ đề có phân trang
router.get("/list", async (req, res) => {
  try {
    let { page, pageIndex, pageSize = 10 } = req.query;
    const currentPage = parseInt(page || pageIndex || 1);
    pageSize = parseInt(pageSize);
    const offset = (currentPage - 1) * pageSize;
    const limit = pageSize;

    const { count, rows } = await Topic.findAndCountAll({ limit, offset });

    const pagination = calculatePagination(count, currentPage, pageSize);
    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy chủ đề theo ID
router.get("/:id", async (req, res) => {
  try {
    const topic = await Topic.findByPk(req.params.id);
    if (!topic) return sendNotFoundResponse(res, "Không tìm thấy chủ đề");
    sendDetailResponse(res, transformToCamelCase(topic));
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Thêm chủ đề mới
router.post("/", async (req, res) => {
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
router.put("/:id", async (req, res) => {
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
router.delete("/:id", async (req, res) => {
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
