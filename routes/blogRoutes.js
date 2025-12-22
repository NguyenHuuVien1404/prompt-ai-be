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
  // Nếu là JSON request (không có file upload), bỏ qua multer
  if (
    req.headers["content-type"] &&
    req.headers["content-type"].includes("application/json")
  ) {
    return next();
  }

  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // Lỗi từ multer
      if (err.code === "LIMIT_FILE_SIZE") {
        return sendErrorResponse(
          res,
          "File size too large. Max size is 50MB",
          "VALIDATION_ERROR",
          400
        );
      }
      return sendErrorResponse(res, err.message, "VALIDATION_ERROR", 400);
    } else if (err) {
      // Lỗi khác
      return sendErrorResponse(res, err.message, "VALIDATION_ERROR", 400);
    }
    // Không có lỗi
    next();
  });
};

// Middleware kiểm tra đầu vào
const validateBlogData = (req, res, next) => {
  const { title, content, category_id, categoryId } = req.body;
  const categoryIdValue = category_id || categoryId;

  if (!title || !content || !categoryIdValue) {
    return sendErrorResponse(
      res,
      "Missing required fields: title, content, and categoryId are required",
      "VALIDATION_ERROR",
      400
    );
  }

  // Validate featuredImage URL format if provided
  if (req.body.featuredImage && typeof req.body.featuredImage === "string") {
    try {
      new URL(req.body.featuredImage);
    } catch (error) {
      return sendErrorResponse(
        res,
        "Invalid featuredImage URL format",
        "VALIDATION_ERROR",
        400
      );
    }
  }

  next();
};

// 📌 **Lấy danh sách bài viết có phân trang**
router.get("/", async (req, res) => {
  try {
    // Hỗ trợ cả page và pageIndex
    let { page, pageIndex, pageSize = 6, search = "" } = req.query;
    const currentPage = parseInt(page || pageIndex || 1);
    const limit = parseInt(pageSize);

    const offset = (currentPage - 1) * limit;

    const whereCondition = {};
    if (search && search.trim() !== "") {
      whereCondition.title = {
        [Op.like]: `%${search}%`,
      };
    }

    // Get total count without includes
    const totalCount = await Blog.count({ where: whereCondition });

    // Get actual data with includes
    const rows = await Blog.findAll({
      where: whereCondition,
      include: [{ model: BlogCategory, as: "category", attributes: ["name"] }],
      limit,
      offset,
      order: [["published_at", "DESC"]],
    });

    const pagination = calculatePagination(totalCount, currentPage, limit);
    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// 📌 **Lấy danh sách bài viết có phân trang (deprecated - dùng / thay thế)**
router.get("/list", async (req, res) => {
  try {
    let { page, pageIndex, pageSize = 6, search = "" } = req.query;
    const currentPage = parseInt(page || pageIndex || 1);
    pageSize = parseInt(pageSize);

    const offset = (currentPage - 1) * pageSize;
    const limit = pageSize;

    const whereCondition = {};
    if (search && search.trim() !== "") {
      whereCondition.title = {
        [Op.like]: `%${search.trim()}%`,
      };
    }

    // Get total count without includes
    const totalCount = await Blog.count({ where: whereCondition });

    // Get actual data with includes
    const rows = await Blog.findAll({
      where: whereCondition,
      include: [{ model: BlogCategory, as: "category", attributes: ["name"] }],
      limit,
      offset,
      order: [["published_at", "DESC"]],
    });

    const pagination = calculatePagination(totalCount, currentPage, pageSize);
    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
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

    const pagination = calculatePagination(blogs.length, 1, blogs.length);
    sendListResponse(res, transformToCamelCase(blogs), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await Blog.findOne({
      where: { id },
      include: [
        { model: BlogCategory, as: "category", attributes: ["id", "name"] },
      ],
    });

    if (!blog) {
      return sendNotFoundResponse(res, "Blog không tồn tại");
    }

    // Transform để đưa category_id vào category.id
    const blogData = blog.toJSON();
    if (blogData.category) {
      blogData.category.id = blogData.category_id;
    }

    sendDetailResponse(res, transformToCamelCase(blogData));
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Route tạo blog mới
router.post(
  "/",
  authMiddleware,
  adminOrMarketerMiddleware,
  handleUpload,
  validateBlogData,
  async (req, res) => {
    // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể tạo
    try {
      const serverUrl = `${req.protocol}://${req.get("host")}`;
      const blogData = {
        ...req.body,
        category_id: Number(req.body.category_id || req.body.categoryId),
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
            return sendErrorResponse(
              res,
              "Invalid date format for published_at",
              "VALIDATION_ERROR",
              400
            );
          }
          blogData.published_at = dateValue;
        }
      } else {
        // Fallback logic cũ nếu không có published_at
        blogData.published_at =
          req.body.status === "published" ? new Date() : null;
      }

      const blog = await Blog.create(blogData);
      sendCreateResponse(
        res,
        transformToCamelCase(blog),
        "Blog created successfully"
      );
    } catch (error) {
      // Xóa file nếu có lỗi khi tạo blog
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Route cập nhật blog
router.put(
  "/:id",
  authMiddleware,
  adminOrMarketerMiddleware,
  handleUpload,
  validateBlogData,
  async (req, res) => {
    // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể update
    try {
      const blog = await Blog.findByPk(req.params.id);
      if (!blog) return sendNotFoundResponse(res, "Blog not found");

      const serverUrl = `${req.protocol}://${req.get("host")}`;
      let blogData = { ...req.body };

      // Xử lý categoryId thành category_id
      if (req.body.categoryId) {
        blogData.category_id = Number(req.body.categoryId);
        delete blogData.categoryId;
      }

      // Xử lý featured_image từ file upload hoặc JSON body
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
      } else if (req.body.featuredImage) {
        // Xử lý featuredImage từ JSON body
        blogData.featured_image = req.body.featuredImage;
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
            return sendErrorResponse(
              res,
              "Invalid date format for published_at",
              "VALIDATION_ERROR",
              400
            );
          }
          blogData.published_at = dateValue;
        }
      }

      await blog.update(blogData);
      sendUpdateResponse(
        res,
        transformToCamelCase(blog),
        "Blog updated successfully"
      );
    } catch (error) {
      // Xóa file mới nếu có lỗi khi cập nhật
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Delete blog with image cleanup
router.delete(
  "/:id",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể xóa
    try {
      const blog = await Blog.findByPk(req.params.id);
      if (!blog) return sendNotFoundResponse(res, "Blog not found");

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
      sendDeleteResponse(res, "Successfully deleted");
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

module.exports = router;
