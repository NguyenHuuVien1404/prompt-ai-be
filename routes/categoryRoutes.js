const express = require("express");
const router = express.Router();
const Category = require("../models/Category");

// Lấy danh sách danh mục
router.get("/", async (req, res) => {
    try {
        const categories = await Category.findAll();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get("/list", async (req, res) => {
    try {
        // Lấy page và pageSize từ query params, mặc định page = 1, pageSize = 10
        let { page = 1, pageSize = 10 } = req.query;

        // Chuyển đổi sang số nguyên
        page = parseInt(page);
        pageSize = parseInt(pageSize);

        // Tính offset để lấy dữ liệu phân trang
        const offset = (page - 1) * pageSize;
        const limit = pageSize;

        // Lấy danh sách categories với phân trang
        const { count, rows } = await Category.findAndCountAll({
            limit,
            offset,
        });

        // Trả về dữ liệu phân trang
        res.json({
            totalItems: count,
            totalPages: Math.ceil(count / pageSize),
            currentPage: page,
            pageSize,
            categories: rows,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Lấy chi tiết danh mục
router.get("/:id", async (req, res) => {
    try {
        const category = await Category.findByPk(req.params.id);
        if (!category) return res.status(404).json({ message: "Không tìm thấy danh mục" });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Thêm danh mục
router.post("/", async (req, res) => {
    try {
        const { name, description } = req.body;
        const category = await Category.create({ name, description });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cập nhật danh mục
router.put("/:id", async (req, res) => {
    try {
        const { name, description } = req.body;
        const category = await Category.findByPk(req.params.id);
        if (!category) return res.status(404).json({ message: "Không tìm thấy danh mục" });

        await category.update({ name, description });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Xóa danh mục
router.delete("/:id", async (req, res) => {
    try {
        const category = await Category.findByPk(req.params.id);
        if (!category) return res.status(404).json({ message: "Không tìm thấy danh mục" });

        await category.destroy();
        res.json({ message: "Xóa thành công" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
