const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");

// Lấy tất cả blog
router.get("/", async (req, res) => {
    try {
        const blogs = await Blog.findAll();
        res.json(blogs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Thêm blog mới
router.post("/", async (req, res) => {
    try {
        const blog = await Blog.create(req.body);
        res.json(blog);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cập nhật blog
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await Blog.update(req.body, { where: { id } });
        res.json({ message: "Updated successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Xóa blog
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await Blog.destroy({ where: { id } });
        res.json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
