const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Blog = require("../models/Blog");
const BlogCategory = require("../models/BlogCategory");
const { Sequelize } = require("sequelize");
const { Op } = require("sequelize");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
// Cấu hình storage cho multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "/var/www/promvn/uploads";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Lấy extension của file gốc
    const ext = path.extname(file.originalname).toLowerCase();
    // Tạo tên file mới
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ext);
  },
});

// Kiểm tra file type
const fileFilter = (req, file, cb) => {
  // Kiểm tra mime type của file
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

// Cấu hình multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
}).single("featured_image");

// Middleware xử lý upload với xử lý lỗi
const handleUpload = (req, res, next) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // Lỗi từ multer
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: "File size too large. Max size is 5MB",
        });
      }
      return res.status(400).json({
        error: err.message,
      });
    } else if (err) {
      // Lỗi khác
      return res.status(400).json({
        error: err.message,
      });
    }
    // Không có lỗi
    next();
  });
};

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
      include: [{ model: BlogCategory, as: "category", attributes: ["name"] }],
    });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 📌 **Lấy danh sách bài viết có phân trang**
router.get("/list", async (req, res) => {
  try {
    let { page = 1, pageSize = 6, search } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);

    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    const { count, rows } = await Blog.findAndCountAll({
      where: {
        title: {
          [Op.like]: `%${search}%`, // Tìm kiếm gần đúng
        },
      },
      include: [{ model: BlogCategory, as: "category", attributes: ["name"] }],
      limit,
      offset,
      order: [["published_at", "DESC"]],
    });

    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / pageSize),
      currentPage: page,
      pageSize,
      blogs: rows,
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
      include: [{ model: BlogCategory, as: "category", attributes: ["name"] }],
      order: [["published_at", "DESC"]],
    });

    res.json({ blogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await Blog.findOne({
      where: { id },
      include: [{ model: BlogCategory, as: "category", attributes: ["name"] }],
    });

    if (!blog) {
      return res.status(404).json({ error: "Blog không tồn tại" });
    }

    res.json(blog);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Route tạo blog mới
router.post("/", handleUpload, validateBlogData, async (req, res) => {
  try {
    const serverUrl = `${req.protocol}://${req.get("host")}`;
    const blogData = {
      ...req.body,
      category_id: Number(req.body.category_id),
      featured_image: req.file
        ? `${serverUrl}/uploads/${req.file.filename}`
        : null,
    };

    // ✅ Xử lý published_at để tránh lỗi "Invalid date" - giống như route PUT
    if (req.body.published_at !== undefined) {
      if (
        req.body.published_at === null ||
        req.body.published_at === "" ||
        req.body.published_at === "null"
      ) {
        blogData.published_at = null;
      } else if (
        req.body.published_at === "now" ||
        req.body.published_at === "current"
      ) {
        blogData.published_at = new Date();
      } else if (
        req.body.published_at === "draft" ||
        req.body.published_at === "unpublish"
      ) {
        blogData.published_at = null;
      } else {
        // Kiểm tra xem có phải date hợp lệ không
        const dateValue = new Date(req.body.published_at);

        if (isNaN(dateValue.getTime())) {
          return res.status(400).json({
            error: "Invalid date format for published_at",
            receivedValue: req.body.published_at,
            expectedFormats: [
              "null",
              "now",
              "current",
              "2024-01-01",
              "2024-01-01T00:00:00.000Z",
            ],
          });
        }
        blogData.published_at = dateValue;
      }
    } else {
      // Fallback logic cũ nếu không có published_at
      blogData.published_at =
        req.body.status === "published" ? new Date() : null;
    }

    const blog = await Blog.create(blogData);
    res.status(201).json(blog);
  } catch (error) {
    // Xóa file nếu có lỗi khi tạo blog
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Route cập nhật blog
router.put("/:id", handleUpload, validateBlogData, async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    const serverUrl = `${req.protocol}://${req.get("host")}`;
    let blogData = { ...req.body };

    if (req.file) {
      // Xóa ảnh cũ nếu có
      if (blog.featured_image) {
        // Extract filename from the full URL path
        const filename = blog.featured_image.split("/uploads/").pop();
        if (filename) {
          const oldPath = path.join("/var/www/promvn/uploads", filename);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
      }
      blogData.featured_image = `${serverUrl}/uploads/${req.file.filename}`;
    }

    // ✅ Xử lý published_at để tránh lỗi "Invalid date"
    if (req.body.published_at !== undefined) {
      if (
        req.body.published_at === null ||
        req.body.published_at === "" ||
        req.body.published_at === "null"
      ) {
        blogData.published_at = null;
      } else if (
        req.body.published_at === "now" ||
        req.body.published_at === "current"
      ) {
        blogData.published_at = new Date();
      } else if (
        req.body.published_at === "draft" ||
        req.body.published_at === "unpublish"
      ) {
        blogData.published_at = null;
      } else {
        // Kiểm tra xem có phải date hợp lệ không
        const dateValue = new Date(req.body.published_at);

        if (isNaN(dateValue.getTime())) {
          return res.status(400).json({
            error: "Invalid date format for published_at",
            receivedValue: req.body.published_at,
            expectedFormats: [
              "null",
              "now",
              "current",
              "2024-01-01",
              "2024-01-01T00:00:00.000Z",
            ],
          });
        }
        blogData.published_at = dateValue;
      }
    }

    await blog.update(blogData);
    res.json(blog);
  } catch (error) {
    // Xóa file mới nếu có lỗi khi cập nhật
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete blog with image cleanup
router.delete("/:id", async (req, res) => {
  try {
    const blog = await Blog.findByPk(req.params.id);
    if (!blog) return res.status(404).json({ message: "Blog not found" });

    if (blog.featured_image) {
      // Extract filename from the full URL path
      const filename = blog.featured_image.split("/uploads/").pop();
      if (filename) {
        const imagePath = path.join("/var/www/promvn/uploads", filename);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
    }

    await blog.destroy();
    res.json({ message: "Successfully deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
