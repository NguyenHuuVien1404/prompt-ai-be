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
const checkSubTypeAccess = require('../middleware/subTypeMiddleware');

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

    const { runTask } = require('../utils/worker');
    const filePaths = req.files.map(file => file.path);

    try {
      const result = await runTask('image-processor.js', {
        filePaths,
        host: req.get("host"),
        protocol: req.protocol
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      res.status(200).json({
        message: "Files uploaded and processed successfully",
        imageUrls: result.imageUrls,
      });
    } catch (error) {
      console.error("Error processing images:", error);
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
router.get("/", authMiddleware, checkSubTypeAccess, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    const where = {};

    if (req.query.category_id) {
      where.category_id = req.query.category_id;
    }

    if (req.query.is_type) {
      where.is_type = req.query.is_type;
    }

    // Thêm điều kiện sub_type dựa trên quyền truy cập
    if (Array.isArray(req.subTypeAccess)) {
      where.sub_type = { [Op.in]: req.subTypeAccess };
    } else {
      where.sub_type = req.subTypeAccess;
    }

    if (req.query.status !== undefined) {
      where.status = req.query.status;
    }

    if (req.query.topic_id !== undefined) {
      where.topic_id = req.query.topic_id;
    }

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

    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompts", error: error.message });
  }
});

// Get all prompts for user by categoryId with pagination
router.get("/by-category", authMiddleware, checkSubTypeAccess, async (req, res) => {
  try {
    const category_id = req.query.category_id;
    if (!category_id) {
      return res.status(400).json({ message: "category_id is required" });
    }
    const is_type = req.query.is_type || 1;
    const sub_type = req.query.sub_type || 1;
    const topic_id = req.query.topic_id;
    const searchText = req.query.search_text;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 12;

    const offset = (page - 1) * pageSize;
    let whereCondition = { 
      category_id: category_id,
      sub_type: sub_type
    };
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

    // Thêm điều kiện sub_type dựa trên quyền truy cập
    if (Array.isArray(req.subTypeAccess)) {
      whereCondition.sub_type = { [Op.in]: req.subTypeAccess };
    } else {
      whereCondition.sub_type = req.subTypeAccess;
    }

    const { count, rows } = await Prompt.findAndCountAll({
      where: whereCondition,
      include: [
        { model: Category, attributes: ["id", "name", "image", "image_card"], include: { model: Section, attributes: ["id", "name", "description"] } },
        { model: Topic, attributes: ["id", "name"] },
      ],
      limit: pageSize,
      offset: offset,
    });

    const result = {
      total: count,
      page,
      pageSize,
      data: rows,
    };

    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompts", error: error.message });
  }
});

router.get("/topics/by-category", authMiddleware, checkSubTypeAccess, async (req, res) => {
  try {
    const { category_id } = req.query;
    if (!category_id) {
      return res.status(400).json({ message: "category_id is required" });
    }

    let whereCondition = { 
      category_id
    };

    // Thêm điều kiện sub_type dựa trên quyền truy cập
    if (Array.isArray(req.subTypeAccess)) {
      whereCondition.sub_type = { [Op.in]: req.subTypeAccess };
    } else {
      whereCondition.sub_type = req.subTypeAccess;
    }

    const prompts = await Prompt.findAll({
      where: whereCondition,
      attributes: ["topic_id"],
      raw: true,
    });

    if (!prompts.length) {
      return res
        .status(404)
        .json({ message: "No topics found for this category" });
    }

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

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching topics:", error);
    res
      .status(500)
      .json({ message: "Error fetching topics", error: error.message });
  }
});

// lấy list prompts mới nhất
router.get("/newest", authMiddleware, checkSubTypeAccess, async (req, res) => {
  try {
    const category_id = req.query.category_id;
    if (!category_id) {
      return res.status(400).json({ message: "category_id is required" });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

    let whereCondition = {
      category_id: category_id,
      created_at: {
        [Op.gte]: thirtyDaysAgo,
      }
    };

    // Thêm điều kiện sub_type dựa trên quyền truy cập
    if (Array.isArray(req.subTypeAccess)) {
      whereCondition.sub_type = { [Op.in]: req.subTypeAccess };
    } else {
      whereCondition.sub_type = req.subTypeAccess;
    }

    const newest_prompts = await Prompt.findAll({
      where: whereCondition,
      include: [
        { model: Category, attributes: ["id", "name", "image", "image_card"], include: { model: Section, attributes: ["id", "name", "description"] } },
        { model: Topic, attributes: ["id", "name"] }
      ],
      limit: 30,
      order: [["created_at", "DESC"]]
    });

    const result = {
      data: newest_prompts
    };

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error fetching newest prompts", error: error.message });
  }
});

// Get a single prompt by ID with detailed info
router.get("/:id", authMiddleware, checkSubTypeAccess, async (req, res) => {
  try {
    const { id } = req.params;

    let whereCondition = { id };

    // Thêm điều kiện sub_type dựa trên quyền truy cập
    if (Array.isArray(req.subTypeAccess)) {
      whereCondition.sub_type = { [Op.in]: req.subTypeAccess };
    } else {
      whereCondition.sub_type = req.subTypeAccess;
    }

    const prompt = await Prompt.findOne({
      where: whereCondition,
      include: [
        { model: Category, attributes: ["id", "name"], include: { model: Section, attributes: ["id", "name", "description"] } },
        { model: Topic, attributes: ["id", "name"] }
      ]
    });

    if (!prompt) {
      return res.status(404).json({ message: "Prompt not found or you don't have access to it" });
    }

    const relatedPrompts = await Prompt.findAll({
      where: {
        category_id: prompt.category_id,
        sub_type: prompt.sub_type,
        id: { [Op.ne]: id }
      },
      attributes: ["id", "title", "short_description"],
      include: [
        { model: Category, attributes: ["id", "name"] }
      ],
      limit: 5
    });

    res.status(200).json(prompt);
  } catch (error) {
    res.status(500).json({ message: "Error fetching prompt", error: error.message });
  }
});

// Create a new prompt
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const newPrompt = await Prompt.create(req.body);
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

    await prompt.update(req.body);
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

    await prompt.destroy();
    res.status(200).json({ message: "Prompt deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting prompt", error: error.message });
  }
});

module.exports = router;
