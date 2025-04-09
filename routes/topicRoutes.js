const express = require("express");
const router = express.Router();
const Topic = require("../models/Topic");
const { Sequelize } = require("sequelize");
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
// Lấy danh sách chủ đề
router.get("/", async (req, res) => {
    try {
        const topics = await Topic.findAll();
        res.json(topics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Lấy danh sách chủ đề có phân trang
router.get("/list", async (req, res) => {
    try {
        let { page = 1, pageSize = 10 } = req.query;
        page = parseInt(page);
        pageSize = parseInt(pageSize);
        const offset = (page - 1) * pageSize;
        const limit = pageSize;

        const { count, rows } = await Topic.findAndCountAll({ limit, offset });

        res.json({
            totalItems: count,
            totalPages: Math.ceil(count / pageSize),
            currentPage: page,
            pageSize,
            topics: rows,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Lấy chủ đề theo ID
router.get("/:id", async (req, res) => {
    try {
        const topic = await Topic.findByPk(req.params.id);
        if (!topic) return res.status(404).json({ message: "Không tìm thấy chủ đề" });
        res.json(topic);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Thêm chủ đề mới
router.post("/", async (req, res) => {
    try {
        const { name, description } = req.body;
        const topic = await Topic.create({ name, description });
        res.json(topic);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cập nhật chủ đề
router.put("/:id", async (req, res) => {
    try {
        const { name } = req.body;
        const topic = await Topic.findByPk(req.params.id);
        if (!topic) return res.status(404).json({ message: "Không tìm thấy chủ đề" });

        await topic.update({ name });
        res.json(topic);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Xóa chủ đề
router.delete("/:id", async (req, res) => {
    try {
        const topic = await Topic.findByPk(req.params.id);
        if (!topic) return res.status(404).json({ message: "Không tìm thấy chủ đề" });

        await topic.destroy();
        res.json({ message: "Xóa thành công" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;