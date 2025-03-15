const express = require("express");
const router = express.Router();
const { Op, Sequelize } = require("sequelize");
const Prompt = require("../models/Prompt");
const Category = require("../models/Category");
const Topic = require("../models/Topic");
const multer = require("multer");
const path = require("path");
const Section = require("../models/Section");
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
  const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Chấp nhận file hợp lệ
  } else {
    cb(
      new Error("Invalid file type. Only JPG, PNG, and GIF are allowed."),
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
router.post("/upload", upload.any(), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    // Lấy base URL của server (dùng req.protocol + req.get('host'))
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Trả về danh sách URL ảnh đầy đủ
    const imageUrls = req.files.map(
      (file) => `${baseUrl}/uploads/${file.filename}`
    );

    res.status(200).json({
      message: "Files uploaded successfully",
      imageUrls: imageUrls,
    });
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

    if (req.query.search) {
      where.title = {
        [Op.like]: `%${req.query.search}%`
      };
    }

    const { count, rows } = await Prompt.findAndCountAll({
      where,
      include: [
        { model: Category, attributes: ["id", "name", "image", "image_card"], include: {model: Section, attributes: ["id", "name", "description"]} },
        {
          model: Topic,
          attributes: ["id", "name"],
        },
      ],
      limit: pageSize,
      offset: offset,
      order: [["created_at", "DESC"]],
    });

    res.status(200).json({
      total: count,
      page,
      pageSize,
      data: rows,
    });
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
    const offset = (page - 1) * pageSize;
    // Tạo điều kiện lọc động
    let whereCondition = { category_id: category_id, is_type: is_type };
    if (topic_id && topic_id != 0) {
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
        { model: Category, attributes: ["id", "name", "image", "image_card"], include: {model: Section, attributes: ["id", "name", "description"]} },
        { model: Topic, attributes: ["id", "name"] },
      ],
      limit: pageSize,
      offset: offset,
      // order: [["created_at", "DESC"]],
    });

    res.status(200).json({
      total: count,
      page,
      pageSize,
      data: rows,
    });
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

    // Kiểm tra xem có prompt nào với category_id không
    const prompts = await Prompt.findAll({
      where: { category_id },
      attributes: ["topic_id"], // Chỉ lấy topic_id để tìm topic tương ứng
      raw: true,
    });

    if (!prompts.length) {
      return res
        .status(404)
        .json({ message: "No topics found for this category" });
    }

    // Lấy danh sách topic dựa trên topic_id từ bảng Prompt
    const topicIds = [...new Set(prompts.map((p) => p.topic_id))]; // Lọc các topic_id duy nhất
    const topics = await Topic.findAll({
      where: { id: topicIds },
      raw: true,
    });

    res.status(200).json({
      category_id,
      total: topics.length,
      topics,
    });
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
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Lấy danh sách content mới nhất trong vòng 30 ngày
    const newest_prompts = await Prompt.findAll({
      where: {
        category_id: category_id,
        created_at: {
          [Op.gte]: thirtyDaysAgo, // Lọc các prompt có created_at >= 30 ngày trước
        },
      },
      include: [
        { model: Category, attributes: ["id", "name", "image", "image_card"], include: {model: Section, attributes: ["id", "name", "description"]} },
        { model: Topic, attributes: ["id", "name"] },
      ],
      order: [["created_at", "DESC"]], // Sắp xếp theo ngày tạo mới nhất
    });

    res.status(200).json({
      category_id,
      total: newest_prompts.length,
      data: newest_prompts,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching newest prompts", error: error.message });
  }
});

// lấy list prompts liên quan
router.get("/related", async (req, res) => {
  try {
    const category_id = req.query.category_id;
    if (!category_id) {
      return res.status(400).json({ message: "category_id is required" });
    }
    const topic_id = req.query.topic_id;
    if (!topic_id) {
      return res.status(400).json({ message: "topic_id is required" });
    }
    const current_id = req.query.current_id;
    if (!current_id) {
      return res.status(400).json({ message: "current_id is required" });
    }
    const related_prompts = await Prompt.findAll({
      where: {
        category_id: category_id,
        topic_id: topic_id,
        id: { [Op.ne]: current_id },
      },
      include: [
        { model: Category, attributes: ["id", "name", "image", "image_card"], include: {model: Section, attributes: ["id", "name", "description"]} },
        { model: Topic, attributes: ["id", "name"] },
      ],
      order: [["created_at", "DESC"]], // Sắp xếp theo ngày tạo mới nhất
    });

    res.status(200).json({
      category_id,
      total: related_prompts.length,
      data: related_prompts,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching newest prompts", error: error.message });
  }
});
// Get prompt by id
router.get("/:id", async (req, res) => {
  try {
    const promptId = req.params.id;
    const prompt = await Prompt.findByPk(promptId, {
      include: [
        { model: Category, attributes: ["id", "name", "image", "image_card"], include: {model: Section, attributes: ["id", "name", "description"]} },
        { model: Topic, attributes: ["id", "name"] },
      ],
    });

    if (!prompt) {
      return res.status(404).json({ message: "Prompt not found" });
    }

    res.status(200).json(prompt);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompt", error: error.message });
  }
});

// Create new prompt
router.post("/", async (req, res) => {
  try {
    const {
      title,
      content,
      short_description,
      category_id,
      is_type,
      what,
      tips,
      text,
      how,
      input,
      output,
      OptimationGuide,
      addtip,
      addinformation,
      topic_id
    } = req.body;
    // Validate required fields
    if (!title || !content || !short_description) {
      return res.status(400).json({
        message: "Title, content, and short description are required",
      });
    }

    const newPrompt = await Prompt.create({
      title,
      content,
      short_description,
      category_id,
      is_type: is_type || 1,
      what,
      tips,
      text,
      how,
      input,
      output,
      OptimationGuide,
      addtip,
      addinformation,
      topic_id
    });

    res.status(201).json(newPrompt);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating prompt", error: error.message });
  }
});

// Update prompt
router.put("/:id", async (req, res) => {
  try {
    const promptId = req.params.id;
    const {
      title,
      content,
      short_description,
      category_id,
      is_type,
      what,
      tips,
      text,
      how,
      input,
      output,
      OptimationGuide,
      addtip,
      addinformation,
      topic_id
    } = req.body;

    const prompt = await Prompt.findByPk(promptId);
    if (!prompt) {
      return res.status(404).json({ message: "Prompt not found" });
    }

    await prompt.update({
      title: title || prompt.title,
      content: content || prompt.content,
      short_description: short_description || prompt.short_description,
      category_id: category_id || prompt.category_id,
      is_type: is_type !== undefined ? is_type : prompt.is_type,
      what: what || prompt.what,
      tips: tips || prompt.tips,
      text: text || prompt.text,
      how: how || prompt.how,
      input: input || prompt.input,
      output: output || prompt.output,
      OptimationGuide: OptimationGuide || prompt.OptimationGuide,
      addtip: addtip || prompt.addtip,
      addinformation: addinformation || prompt.addinformation,
      topic_id: topic_id || prompt.topic_id
    });

    res.status(200).json(prompt);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating prompt", error: error.message });
  }
});

// Delete prompt
router.delete("/:id", async (req, res) => {
  try {
    const promptId = req.params.id;
    const prompt = await Prompt.findByPk(promptId);

    if (!prompt) {
      return res.status(404).json({ message: "Prompt not found" });
    }

    await prompt.destroy();
    res.status(200).json({ message: "Prompt deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting prompt", error: error.message });
  }
});
// API upload ảnh

module.exports = router;
