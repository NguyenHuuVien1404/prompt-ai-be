const express = require("express");
const router = express.Router();
const BlogCategory = require("../models/BlogCategory");

// Lấy tất cả danh mục
router.get("/", async (req, res) => {
    try {
        const categories = await BlogCategory.findAll();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Thêm danh mục mới
router.post("/", async (req, res) => {
    try {
        const { name, description, slug } = req.body;
        const category = await BlogCategory.create({ name, description, slug });
        res.json(category);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cập nhật danh mục
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await BlogCategory.update(req.body, { where: { id } });
        res.json({ message: "Updated successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Xóa danh mục
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await BlogCategory.destroy({ where: { id } });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
