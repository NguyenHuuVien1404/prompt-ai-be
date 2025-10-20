const express = require("express");
const router = express.Router();
const BlogCategory = require("../models/BlogCategory");
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
const { safeUpdate } = require("../utils/fieldTransformUtils");
// Lấy tất cả danh mục
router.get("/", async (req, res) => {
  try {
    const categories = await BlogCategory.findAll();
    sendListResponse(
      res,
      transformToCamelCase(categories),
      calculatePagination(categories.length, 1, categories.length)
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Lấy danh sách danh mục có phân trang
router.get("/list", async (req, res) => {
  try {
    const { page, pageIndex, pageSize = 10 } = req.query;
    const offset = (currentPage - 1) * pageSize;
    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);

    const { count, rows } = await BlogCategory.findAndCountAll({
      order: [["created_at", "DESC"]],
      limit: pageSizeNum,
      offset: offset,
    });

    const pagination = calculatePagination(count, pageNum, pageSizeNum);
    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Thêm danh mục mới
router.post("/", async (req, res) => {
  try {
    const { name, description, slug } = req.body;
    const category = await BlogCategory.create({ name, description, slug });
    sendCreateResponse(
      res,
      transformToCamelCase(category),
      "Blog category created successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Cập nhật danh mục
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const category = await BlogCategory.findByPk(id);
    if (!category) return sendNotFoundResponse(res, "Blog category not found");

    await safeUpdate(BlogCategory, req.body, { where: { id } });
    const updatedCategory = await BlogCategory.findByPk(id);
    sendUpdateResponse(
      res,
      transformToCamelCase(updatedCategory),
      "Blog category updated successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Xóa danh mục
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const category = await BlogCategory.findByPk(id);
    if (!category) return sendNotFoundResponse(res, "Blog category not found");

    await BlogCategory.destroy({ where: { id } });
    sendDeleteResponse(res, "Blog category deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

module.exports = router;
