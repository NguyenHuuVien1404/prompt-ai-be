const express = require("express");
const router = express.Router();
const Blog = require("../models/Blog");
const BlogCategory = require("../models/BlogCategory");
const { Sequelize } = require("sequelize");

// Middleware kiểm tra đầu vào
const validateBlogData = (req, res, next) => {
    const { title, content, category_id } = req.body;
    if (!title || !content || !category_id) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    next();
};

// 📌 **Lấy tất cả bài viết**
router.get("/", async (req, res) => {
    try {
        const blogs = await Blog.findAll({
            include: [
                { model: BlogCategory, as: "category", attributes: ["name"] },
            ]
        });
        res.json(blogs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 **Lấy danh sách bài viết có phân trang**
router.get("/list", async (req, res) => {
    try {
        let { page = 1, pageSize = 10 } = req.query;
        page = parseInt(page);
        pageSize = parseInt(pageSize);

        const offset = (page - 1) * pageSize;
        const limit = pageSize;

        const { count, rows } = await Blog.findAndCountAll({
            where: { status: "published" },
            include: [
                { model: BlogCategory, as: "category", attributes: ["name"] },
            ],
            limit,
            offset,
            order: [["published_at", "DESC"]]
        });

        res.json({
            totalItems: count,
            totalPages: Math.ceil(count / pageSize),
            currentPage: page,
            pageSize,
            blogs: rows
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 **Lấy bài viết theo category**
router.get("/by-category/:categoryId", async (req, res) => {
    try {
        const { categoryId } = req.params;
        const blogs = await Blog.findAll({
            where: { category_id: categoryId },
            include: [
                { model: BlogCategory, as: "category", attributes: ["name"] },
            ],
            order: [["published_at", "DESC"]]
        });

        res.json({ blogs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 **Lấy bài viết theo slug**
router.get("/:slug", async (req, res) => {
    try {
        const blog = await Blog.findOne({
            include: [
                { model: BlogCategory, as: "category", attributes: ["name"] },
            ]
        });

        if (!blog) return res.status(404).json({ message: "Không tìm thấy bài viết" });
        res.json(blog);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 **Tạo bài viết mới**
router.post("/", validateBlogData, async (req, res) => {
    try {
        const blog = await Blog.create(req.body);
        res.status(201).json(blog);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 **Cập nhật bài viết**
router.put("/:id", validateBlogData, async (req, res) => {
    try {
        const blog = await Blog.findByPk(req.params.id);
        if (!blog) return res.status(404).json({ message: "Không tìm thấy bài viết" });

        await blog.update(req.body);
        res.json(blog);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📌 **Xóa bài viết**
router.delete("/:id", async (req, res) => {
    try {
        const blog = await Blog.findByPk(req.params.id);
        if (!blog) return res.status(404).json({ message: "Không tìm thấy bài viết" });

        await blog.destroy();
        res.json({ message: "Xóa thành công" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
