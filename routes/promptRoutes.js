const express = require("express");
const router = express.Router();
const { Op, Sequelize } = require("sequelize");
const Prompt = require("../models/Prompt");
const Category = require("../models/Category");
const Topic = require("../models/Topic");
const multer = require("multer");
const path = require("path");
const sequelize = require('../config/database');
const Section = require("../models/Section");
const PromDetails = require("../models/PromDetails");
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const cache = require('../utils/cache');

// Cấu hình Multer để lưu file vào thư mục "uploads"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Lưu file vào thư mục "uploads"
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Tạo tên file duy nhất
  },
});

// Chỉ cho phép upload file ảnh (JPG, PNG, GIF, JPEG)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",  // JPG, JPEG
    "image/png",   // PNG
    "image/gif",   // GIF
    "image/bmp",   // BMP
    "image/webp",  // WebP
    "image/tiff",  // TIFF
    "image/svg+xml", // SVG
    "image/heic",  // HEIC (High-Efficiency Image Container)
    "image/heif"   // HEIF (High-Efficiency Image File Format)
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Chấp nhận file hợp lệ
  } else {
    cb(
      new Error("Invalid file type. Only common image formats (JPG, PNG, GIF, BMP, WebP, TIFF, SVG, HEIC, HEIF) are allowed."),
      false
    );
  }
};

// Multer middleware: Cho phép upload ảnh, không quan trọng tên field
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn file tối đa 5MB
});

router.use("/upload", express.static("uploads")); // Cho phép truy cập ảnh đã upload

// API Upload ảnh (tên field nào cũng được)
router.post("/upload", authMiddleware, upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Xử lý ảnh bằng worker threads cho các tác vụ nặng như resize, optimize
    const { runTask } = require('../utils/worker');

    // Truyền thông tin file sang worker để xử lý
    const filePaths = req.files.map(file => file.path);

    try {
      // Gọi worker xử lý ảnh (resize, optimize)
      const result = await runTask('image-processor.js', {
        filePaths,
        host: req.get("host"),
        protocol: req.protocol
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Lưu URL vào cache để tái sử dụng
      for (const url of result.imageUrls) {
        const urlParts = url.split('/');
        const filename = urlParts[urlParts.length - 1];
        await cache.setCache(`image_url_${filename}`, url, 86400); // Cache 1 ngày
      }

      res.status(200).json({
        message: "Files uploaded and processed successfully",
        imageUrls: result.imageUrls,
      });
    } catch (error) {
      console.error("Error processing images:", error);

      // Nếu xử lý worker thất bại, fallback về cách xử lý truyền thống
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const imageUrls = req.files.map(
        (file) => `${baseUrl}/uploads/${file.filename}`
      );

      res.status(200).json({
        message: "Files uploaded successfully (without optimization)",
        imageUrls: imageUrls,
      });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error uploading files", error: error.message });
  }
});

// Get all prompts with pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    // Create cache key based on query parameters
    const queryParams = JSON.stringify({
      page,
      pageSize,
      category_id: req.query.category_id,
      is_type: req.query.is_type,
      status: req.query.status,
      topic_id: req.query.topic_id,
      search: req.query.search
    });

    const cacheKey = `prompts_list_${queryParams}`;

    // Try to get from cache first
    const cachedData = await cache.getCache(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    // Build where clause based on filters
    const where = {};

    if (req.query.category_id) {
      where.category_id = req.query.category_id;
    }

    if (req.query.is_type) {
      where.is_type = req.query.is_type;
    }

    if (req.query.status !== undefined) {
      where.status = req.query.status;
    }

    if (req.query.topic_id !== undefined) {
      where.topic_id = req.query.topic_id;
    }

    // Full-text search across multiple fields
    if (req.query.search) {
      const searchTerm = `%${req.query.search}%`;
      where[Op.or] = [
        { title: { [Op.like]: searchTerm } },
        { content: { [Op.like]: searchTerm } },
        { short_description: { [Op.like]: searchTerm } },
        { what: { [Op.like]: searchTerm } },
        { tips: { [Op.like]: searchTerm } },
        { text: { [Op.like]: searchTerm } },
        { how: { [Op.like]: searchTerm } },
        { OptimationGuide: { [Op.like]: searchTerm } },
      ];
    }

    const { count, rows } = await Prompt.findAndCountAll({
      where,
      include: [
        {
          model: Category,
          attributes: ["id", "name", "image", "image_card", "section_id"],
          include: { model: Section, attributes: ["id", "name", "description"] },
        },
        {
          model: Topic,
          attributes: ["id", "name"],
        },
      ],
      limit: pageSize,
      offset: offset,
      order: [["created_at", "DESC"]],
    });

    const result = {
      total: count,
      page,
      pageSize,
      data: rows,
    };

    // Store in cache for 5 minutes
    await cache.setCache(cacheKey, JSON.stringify(result), 300);

    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompts", error: error.message });
  }
});

// Get all prompts for user by categoryId with pagination
router.get("/by-category", async (req, res) => {
  try {
    const category_id = req.query.category_id;
    if (!category_id) {
      return res.status(400).json({ message: "category_id is required" });
    }
    const is_type = req.query.is_type || 1;
    const topic_id = req.query.topic_id;
    const searchText = req.query.search_text;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 12;

    // Create cache key based on query parameters
    const queryParams = JSON.stringify({
      category_id,
      is_type,
      topic_id,
      searchText,
      page,
      pageSize
    });

    const cacheKey = `prompts_by_category_${queryParams}`;

    // Try to get from cache first
    const cachedData = await cache.getCache(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    const offset = (page - 1) * pageSize;
    // Tạo điều kiện lọc động
    let whereCondition = { category_id: category_id };
    if (topic_id && topic_id != 0 && topic_id != "undefined" && topic_id != null) {
      whereCondition.topic_id = topic_id;
    }
    if (searchText) {
      whereCondition[Op.or] = [
        { title: { [Op.like]: `%${searchText}%` } },
        { title: { [Op.like]: `%${searchText.toLowerCase()}%` } },
        { title: { [Op.like]: `%${searchText.toUpperCase()}%` } },
      ];
    }

    const { count, rows } = await Prompt.findAndCountAll({
      where: whereCondition,
      include: [
        { model: Category, attributes: ["id", "name", "image", "image_card"], include: { model: Section, attributes: ["id", "name", "description"] } },
        { model: Topic, attributes: ["id", "name"] },
      ],
      limit: pageSize,
      offset: offset,
      // order: [["created_at", "DESC"]],
    });

    const result = {
      total: count,
      page,
      pageSize,
      data: rows,
    };

    // Store in cache for 5 minutes
    await cache.setCache(cacheKey, JSON.stringify(result), 300);

    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompts", error: error.message });
  }
});

router.get("/topics/by-category", async (req, res) => {
  try {
    const { category_id } = req.query;
    if (!category_id) {
      return res.status(400).json({ message: "category_id is required" });
    }

    // Create cache key based on category
    const cacheKey = `topics_by_category_${category_id}`;

    // Try to get from cache first (longer cache time since this data changes less frequently)
    const cachedData = await cache.getCache(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    // Kiểm tra xem có prompt nào với category_id không
    const prompts = await Prompt.findAll({
      where: { category_id },
      attributes: ["topic_id"],
      raw: true,
    });

    if (!prompts.length) {
      return res
        .status(404)
        .json({ message: "No topics found for this category" });
    }

    // Lấy danh sách topic dựa trên topic_id từ bảng Prompt
    const topicIds = [...new Set(prompts.map((p) => p.topic_id))];
    const topics = await Topic.findAll({
      where: { id: topicIds },
      raw: true,
    });

    const result = {
      category_id,
      total: topics.length,
      topics,
    };

    // Cache for 15 minutes since this changes less frequently
    await cache.setCache(cacheKey, JSON.stringify(result), 900);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching topics:", error);
    res
      .status(500)
      .json({ message: "Error fetching topics", error: error.message });
  }
});

// lấy list prompts mới nhất
router.get("/newest", async (req, res) => {
  try {
    const category_id = req.query.category_id;
    if (!category_id) {
      return res.status(400).json({ message: "category_id is required" });
    }

    // Lấy ngày hiện tại và ngày cách đây 30 ngày
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

    // Lấy danh sách content mới nhất trong vòng 30 ngày
    const newest_prompts = await Prompt.findAll({
      where: {
        category_id: category_id,
        created_at: {
          [Op.gte]: thirtyDaysAgo, // Lọc các prompt có created_at >= 30 ngày trước
        },
      },
      include: [
        { model: Category, attributes: ["id", "name", "image"] },
        { model: Topic, attributes: ["id", "name"] }
      ],
      limit: limit,
      order: [["created_at", "DESC"]]
    });

    const result = {
      data: newest_prompts
    };

    // Cache newest prompts for 5 minutes
    await cache.setCache(cacheKey, JSON.stringify(result), 300);

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error fetching newest prompts", error: error.message });
  }
});

// Get a single prompt by ID with detailed info
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("id", id)
    // Create cache key for single prompt
    const cacheKey = `prompt_detail_${id}`;

    // Try to get from cache first
    const cachedData = await cache.getCache(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }

    const prompt = await Prompt.findByPk(id, {
      include: [
        { model: Category, attributes: ["id", "name"] },
        { model: Topic, attributes: ["id", "name"] }
      ]
    });

    if (!prompt) {
      return res.status(404).json({ message: "Prompt not found" });
    }

    // Get related prompts (same category, 5 prompts)
    const relatedPrompts = await Prompt.findAll({
      where: {
        category_id: prompt.category_id,
        id: { [Op.ne]: id } // Not this prompt
      },
      attributes: ["id", "title", "short_description"],
      include: [
        { model: Category, attributes: ["id", "name"] }
      ],
      limit: 5
    });

    const result = {
      prompt,
      relatedPrompts
    };

    // Cache individual prompt details for 30 minutes (longer since details change less often)
    await cache.setCache(cacheKey, JSON.stringify(result), 1800);

    res.status(200).json(prompt);
  } catch (error) {
    res.status(500).json({ message: "Error fetching prompt", error: error.message });
  }
});

// Create a new prompt
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const newPrompt = await Prompt.create(req.body);

    // Invalidate relevant caches when a new prompt is added
    await Promise.all([
      cache.invalidateCache(`prompts_newest_*`),
      cache.invalidateCache(`prompts_by_category_*`),
      cache.invalidateCache(`topics_by_category_${req.body.category_id}`),
      cache.invalidateCache(`prompts_list_*`)
    ]);

    res.status(201).json(newPrompt);
  } catch (error) {
    res.status(500).json({ message: "Error creating prompt", error: error.message });
  }
});

// Update a prompt
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const prompt = await Prompt.findByPk(id);

    if (!prompt) {
      return res.status(404).json({ message: "Prompt not found" });
    }

    const oldCategoryId = prompt.category_id;
    const newCategoryId = req.body.category_id || oldCategoryId;

    await prompt.update(req.body);

    // Invalidate relevant caches when a prompt is updated
    await Promise.all([
      cache.invalidateCache(`prompt_detail_${id}`),
      cache.invalidateCache(`prompts_newest_*`),
      cache.invalidateCache(`prompts_by_category_*`),
      cache.invalidateCache(`topics_by_category_${oldCategoryId}`),
      cache.invalidateCache(`topics_by_category_${newCategoryId}`),
      cache.invalidateCache(`prompts_list_*`)
    ]);

    res.status(200).json({ message: "Prompt updated successfully", prompt });
  } catch (error) {
    res.status(500).json({ message: "Error updating prompt", error: error.message });
  }
});

// Delete a prompt
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const prompt = await Prompt.findByPk(id);

    if (!prompt) {
      return res.status(404).json({ message: "Prompt not found" });
    }

    const categoryId = prompt.category_id;

    await prompt.destroy();

    // Invalidate relevant caches when a prompt is deleted
    await Promise.all([
      cache.invalidateCache(`prompt_detail_${id}`),
      cache.invalidateCache(`prompts_newest_*`),
      cache.invalidateCache(`prompts_by_category_*`),
      cache.invalidateCache(`topics_by_category_${categoryId}`),
      cache.invalidateCache(`prompts_list_*`)
    ]);

    res.status(200).json({ message: "Prompt deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting prompt", error: error.message });
  }
});

// API upload ảnh

module.exports = router;
