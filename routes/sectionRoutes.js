const express = require("express");
const router = express.Router();
const Section = require("../models/Section");
const { Op } = require("sequelize");
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
// Lấy danh sách section
router.get("/", async (req, res) => {
  try {
    let { page, pageIndex, pageSize = 10, searchTerm } = req.query;
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
        { description: { [Op.like]: `%${searchTerm.trim()}%` } },
        { name: { [Op.like]: `%${searchTerm.trim().toLowerCase()}%` } },
        { description: { [Op.like]: `%${searchTerm.trim().toLowerCase()}%` } },
        { name: { [Op.like]: `%${searchTerm.trim().toUpperCase()}%` } },
        { description: { [Op.like]: `%${searchTerm.trim().toUpperCase()}%` } },
      ];
    }

    const { count, rows } = await Section.findAndCountAll({
      where: whereCondition,
      limit,
      offset,
      order: [["created_at", "DESC"]],
    });

    const pagination = calculatePagination(count, currentPage, pageSize);
    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy section theo ID
router.get("/:id", async (req, res) => {
  try {
    const section = await Section.findByPk(req.params.id);
    if (!section) return sendNotFoundResponse(res, "Không tìm thấy section");
    sendDetailResponse(res, transformToCamelCase(section));
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Thêm section mới
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    const section = await Section.create({ name, description });
    sendCreateResponse(
      res,
      transformToCamelCase(section),
      "Section created successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Cập nhật section
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    const section = await Section.findByPk(req.params.id);
    if (!section) return sendNotFoundResponse(res, "Không tìm thấy section");

    await section.update({ name, description });
    sendUpdateResponse(
      res,
      transformToCamelCase(section),
      "Section updated successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Xóa section
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const section = await Section.findByPk(req.params.id);
    if (!section) return sendNotFoundResponse(res, "Không tìm thấy section");

    await section.destroy();
    sendDeleteResponse(res, "Section deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

module.exports = router;
