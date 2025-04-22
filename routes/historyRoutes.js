const express = require("express");
const router = express.Router();
const History = require("../models/History");
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// Lấy tất cả lịch sử
router.get("/", async (req, res) => {
    try {
        const histories = await History.findAll();
        res.json(histories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Lấy danh sách lịch sử có phân trang
router.get("/list", async (req, res) => {
    try {
        const { page = 1, pageSize = 10 } = req.query;
        const offset = (page - 1) * pageSize;

        const { count, rows } = await History.findAndCountAll({
            order: [["created_at", "DESC"]],
            limit: parseInt(pageSize),
            offset: offset
        });

        res.json({
            histories: rows,
            totalItems: count,
            totalPages: Math.ceil(count / pageSize),
            currentPage: parseInt(page),
            pageSize: parseInt(pageSize)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Thêm lịch sử mới
router.post("/", async (req, res) => {
    try {
        const { title, request, respone, user_id } = req.body;
        const history = await History.create({ title, request, respone, user_id });
        res.json(history);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cập nhật lịch sử
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await History.update(req.body, { where: { id } });
        res.json({ message: "Updated successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Xóa lịch sử
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await History.destroy({ where: { id } });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Lấy lịch sử theo user_id
router.get("/user/:user_id", async (req, res) => {
    try {
        const { user_id } = req.params;

        const histories = await History.findAll({
            where: { user_id: user_id },
            order: [["created_at", "DESC"]] // Sắp xếp theo ngày tạo
        });

        if (!histories || histories.length === 0) {
            return res.status(404).json({ message: "No histories found for this user" });
        }

        res.json(histories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
