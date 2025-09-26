const express = require("express");
const router = express.Router();
const History = require("../models/History");
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

// Lấy tất cả lịch sử
router.get("/", async (req, res) => {
  try {
    const histories = await History.findAll();
    sendListResponse(
      res,
      histories,
      calculatePagination(histories.length, 1, histories.length)
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy danh sách lịch sử có phân trang
router.get("/list", async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const offset = (page - 1) * pageSize;
    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);

    const { count, rows } = await History.findAndCountAll({
      order: [["created_at", "DESC"]],
      limit: pageSizeNum,
      offset: offset,
    });

    const pagination = calculatePagination(count, pageNum, pageSizeNum);
    sendListResponse(res, rows, pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Thêm lịch sử mới
router.post("/", async (req, res) => {
  try {
    const { title, request, respone, user_id } = req.body;
    const history = await History.create({ title, request, respone, user_id });
    sendCreateResponse(res, history, "History created successfully");
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Cập nhật lịch sử
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const history = await History.findByPk(id);
    if (!history) return sendNotFoundResponse(res, "History not found");

    await History.update(req.body, { where: { id } });
    const updatedHistory = await History.findByPk(id);
    sendUpdateResponse(res, updatedHistory, "History updated successfully");
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Xóa lịch sử
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const history = await History.findByPk(id);
    if (!history) return sendNotFoundResponse(res, "History not found");

    await History.destroy({ where: { id } });
    sendDeleteResponse(res, "History deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Lấy lịch sử theo user_id
router.get("/user/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const histories = await History.findAll({
      where: { user_id: user_id },
      order: [["created_at", "DESC"]], // Sắp xếp theo ngày tạo
    });

    if (!histories || histories.length === 0) {
      return sendNotFoundResponse(res, "No histories found for this user");
    }

    sendListResponse(
      res,
      histories,
      calculatePagination(histories.length, 1, histories.length)
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

module.exports = router;
