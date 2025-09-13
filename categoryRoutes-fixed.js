const express = require("express");
const router = express.Router();
const { Op, Sequelize } = require("sequelize");
const Category = require("../models/Category");
const Section = require("../models/Section");
const Industry = require("../models/Industry");
const CategoryIndustry = require("../models/CategoryIndustry");
const multer = require("multer");
const path = require("path");
const Prompt = require("../models/Prompt");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const cache = require("../utils/cache");

// Cấu hình Multer để lưu file vào thư mục "uploads"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // cb(null, "uploads/"); // Lưu file vào thư mục "uploads"
    cb(null, "/var/www/promvn/uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Tạo tên file duy nhất
  },
});

// Chỉ cho phép upload file ảnh (JPG, PNG, GIF, JPEG)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg", // JPG, JPEG
    "image/png", // PNG
    "image/gif", // GIF
    "image/bmp", // BMP
    "image/webp", // WebP
    "image/tiff", // TIFF
    "image/svg+xml", // SVG
    "image/heic", // HEIC (High-Efficiency Image Container)
    "image/heif", // HEIF (High-Efficiency Image File Format)
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Chấp nhận file hợp lệ
  } else {
    cb(
      new Error(
        "Invalid file type. Only common image formats (JPG, PNG, GIF, BMP, WebP, TIFF, SVG, HEIC, HEIF) are allowed."
      ),
      false
    );
  }
};

// Multer middleware: Cho phép upload tối đa 2 ảnh (image và image_card)
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn file tối đa 5MB
});

router.use("/upload", express.static("uploads")); // Cho phép truy cập ảnh đã upload

// API Upload ảnh (tên field: image và image_card)
router.post(
  "/upload-images",
  upload.fields([{ name: "image" }, { name: "image_card" }]),
  (req, res) => {
    try {
      if (!req.files || (!req.files["image"] && !req.files["image_card"])) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      // Lấy base URL của server
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      // Trả về danh sách URL ảnh đầy đủ
      const imageUrls = {
        image: req.files["image"]
          ? `${baseUrl}/uploads/${req.files["image"][0].filename}`
          : null,
        image_card: req.files["image_card"]
          ? `${baseUrl}/uploads/${req.files["image_card"][0].filename}`
          : null,
      };

      res.status(200).json({
        message: "Files uploaded successfully",
        imageUrls: imageUrls,
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error uploading files", error: error.message });
    }
  }
);

// Get all categories with pagination and filters
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const type = req.query.type;
    const sectionId = req.query.sectionId;
    const isCommingSoon = req.query.isCommingSoon;
    const searchTxt = req.query.searchTxt;

    const offset = (page - 1) * pageSize;

    let whereCondition = {};

    // Filter theo type
    if (type && ["free", "premium"].includes(type)) {
      whereCondition.type = type;
    }

    // Filter theo section_id
    if (sectionId) {
      whereCondition.section_id = parseInt(sectionId);
    }

    // Filter theo is_comming_soon
    if (isCommingSoon !== undefined) {
      whereCondition.is_comming_soon = isCommingSoon === "true";
    }

    // Filter theo name
    if (searchTxt && searchTxt.trim() !== "") {
      whereCondition[Op.or] = [
        { name: { [Op.like]: `%${searchTxt}%` } },
        { name: { [Op.like]: `%${searchTxt.toLowerCase()}%` } },
        { name: { [Op.like]: `%${searchTxt.toUpperCase()}%` } },
      ];
    }

    const { count, rows } = await Category.findAndCountAll({
      where: whereCondition,
      include: [{ model: Section, attributes: ["id", "name"] }],
      limit: pageSize,
      offset: offset,
      order: [["created_at", "DESC"]],
    });

    const result = {
      total: count,
      page,
      pageSize,
      filters: { type, sectionId, isCommingSoon, searchTxt },
      data: rows,
    };

    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching categories", error: error.message });
  }
});

// Get category by id
router.get("/:id", async (req, res) => {
  try {
    const categoryId = req.params.id;

    const category = await Category.findByPk(categoryId, {
      include: [{ model: Section, attributes: ["id", "name"] }],
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json(category);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching category", error: error.message });
  }
});

// Create new category
router.post(
  "/",
  upload.fields([{ name: "image" }, { name: "image_card" }]),
  async (req, res) => {
    try {
      const { name, description, section_id, is_comming_soon, category_type } =
        req.body;

      // Validate required fields
      if (!name || !section_id) {
        return res
          .status(400)
          .json({ message: "Name and section_id are required" });
      }

      // Validate type field
      if (category_type && !["free", "premium"].includes(category_type)) {
        return res
          .status(400)
          .json({ message: "Type must be either 'free' or 'premium'" });
      }

      // Lấy URL của ảnh từ req.files
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const image = req.files["image"]
        ? `${baseUrl}/uploads/${req.files["image"][0].filename}`
        : null;
      const image_card = req.files["image_card"]
        ? `${baseUrl}/uploads/${req.files["image_card"][0].filename}`
        : null;

      if (!image || !image_card) {
        return res
          .status(400)
          .json({ message: "Both image and image_card are required" });
      }

      const newCategory = await Category.create({
        name,
        image,
        description,
        image_card,
        section_id,
        is_comming_soon,
        type: category_type || "free", // Default to 'free' if not provided
      });

      // Invalidate relevant caches
      // await Promise.all([
      //     cache.invalidateCache(`categories_list_*`),
      //     cache.invalidateCache(`categories_by_section_${section_id}*`),
      // ]);

      res.status(201).json(newCategory);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating category", error: error.message });
    }
  }
);

// Update category
router.put(
  "/:id",
  upload.fields([{ name: "image" }, { name: "image_card" }]),
  async (req, res) => {
    try {
      const categoryId = req.params.id;

      // Extract form data from req.body
      const formData = req.body;

      // Parse boolean values properly
      const parseBoolean = (value) => {
        if (value === "true") return true;
        if (value === "false") return false;
        return value;
      };

      // Ensure we have the form data, fallback to empty object if not
      if (!formData || Object.keys(formData).length === 0) {
        // Warning: req.body is empty, this might cause issues
      }

      const { name, description, section_id, is_comming_soon, category_type } =
        formData;

      const category = await Category.findByPk(categoryId);

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Validate type field if provided
      if (category_type && !["free", "premium"].includes(category_type)) {
        return res
          .status(400)
          .json({ message: "Type must be either 'free' or 'premium'" });
      }

      const oldSectionId = category.section_id;
      const newSectionId = section_id || oldSectionId;

      // Lấy URL của ảnh từ req.files (nếu có)
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const image =
        req.files && req.files["image"]
          ? `${baseUrl}/uploads/${req.files["image"][0].filename}`
          : category.image;
      const image_card =
        req.files && req.files["image_card"]
          ? `${baseUrl}/uploads/${req.files["image_card"][0].filename}`
          : category.image_card;

      // Prepare update data
      const updateData = {
        name: name !== undefined ? name : category.name,
        image,
        description:
          description !== undefined ? description : category.description,
        image_card,
        section_id: parseInt(newSectionId) || oldSectionId,
        is_comming_soon:
          is_comming_soon !== undefined
            ? parseBoolean(is_comming_soon)
            : category.is_comming_soon,
        type: category_type !== undefined ? category_type : category.type,
      };

      await category.update(updateData);

      // Refresh category data after update
      await category.reload();

      res.status(200).json(category);
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error updating category", error: error.message });
    }
  }
);

// Delete category
router.delete("/:id", async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Category.findByPk(categoryId);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const sectionId = category.section_id;
    const categoryName = category.name;

    await category.destroy();

    // Invalidate relevant caches (tạm thời comment lại để kiểm tra lỗi treo)
    // await Promise.all([
    //     cache.invalidateCache(`category_detail_${categoryId}`),
    //     cache.invalidateCache(`categories_list_*`),
    //     cache.invalidateCache(`categories_by_section_${sectionId}*`),
    // ]);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
      data: {
        id: categoryId,
        name: categoryName,
        section_id: sectionId,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting category",
      error: error.message,
    });
  }
});

// Get categories by type (free/premium)
router.get("/by-type/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    // Validate type parameter
    if (!["free", "premium"].includes(type)) {
      return res
        .status(400)
        .json({ message: "Type must be either 'free' or 'premium'" });
    }

    const offset = (page - 1) * pageSize;

    const { count, rows } = await Category.findAndCountAll({
      where: { type },
      include: [{ model: Section, attributes: ["id", "name"] }],
      limit: pageSize,
      offset: offset,
      order: [["created_at", "DESC"]],
    });

    const result = {
      type,
      total: count,
      page,
      pageSize,
      data: rows,
    };

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching categories by type",
      error: error.message,
    });
  }
});

// Get categories by sectionId with type filtering and industry filtering
router.get("/by-sectionId/:sectionId", async (req, res) => {
  try {
    const { sectionId } = req.params;
    const searchTxt = req.query.searchTxt;
    const listCategory = req.query.listCategory;
    const type = req.query.type;
    const industry_id = req.query.industry_id; // Thêm industry filtering

    let whereCondition = { section_id: sectionId };

    // Thêm filter theo type nếu có
    if (type && ["free", "premium"].includes(type)) {
      whereCondition.type = type;
    }

    if (searchTxt && searchTxt != null && searchTxt != "") {
      whereCondition[Op.or] = [
        { name: { [Op.like]: `%${searchTxt}%` } },
        { name: { [Op.like]: `%${searchTxt.toLowerCase()}%` } },
        { name: { [Op.like]: `%${searchTxt.toUpperCase()}%` } },
      ];
    }

    if (
      listCategory &&
      listCategory != null &&
      listCategory != "" &&
      listCategory != "null"
    ) {
      const categoryIds = listCategory
        .split(",")
        .map((id) => parseInt(id.trim(), 10));

      if (categoryIds.length > 0) {
        whereCondition.id = {
          [Op.in]: categoryIds,
        };
      }
    }

    // Handle multiple industry filtering
    let industryFilter = {};
    if (industry_id) {
      const industryIds = Array.isArray(industry_id)
        ? industry_id
        : industry_id
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));

      if (industryIds.length > 0) {
        industryFilter = {
          id: { [Op.in]: industryIds },
        };
      }
    }

    let categories;

    // Nếu có industry filter, cần query riêng để tránh GROUP BY conflict
    if (Object.keys(industryFilter).length > 0) {
      // Bước 1: Lấy category IDs có industry match
      const categoriesWithIndustry = await Category.findAll({
        where: whereCondition,
        include: [
          {
            model: Industry,
            as: "industries",
            attributes: ["id"],
            through: { attributes: [] },
            where: industryFilter,
            required: true,
          },
        ],
        attributes: ["id"],
        raw: true,
      });

      const categoryIds = categoriesWithIndustry.map((cat) => cat.id);

      if (categoryIds.length === 0) {
        // Không có category nào match industry filter
        return res.status(200).json({
          section_id: sectionId,
          type: type || "all",
          industry_id: industry_id || "all",
          total: 0,
          data: [],
        });
      }

      // Bước 2: Query categories với prompt count (không include industries)
      categories = await Category.findAll({
        where: { ...whereCondition, id: { [Op.in]: categoryIds } },
        include: [
          {
            model: Prompt,
            attributes: [],
          },
        ],
        attributes: {
          include: [
            [
              Sequelize.fn("COUNT", Sequelize.col("Prompts.id")),
              "prompt_count",
            ],
          ],
        },
        group: ["Category.id"],
        order: [
          [Sequelize.literal("is_comming_soon = 0"), "DESC"],
          ["created_at", "DESC"],
        ],
      });

      // Bước 3: Load lại industries cho kết quả
      const categoryIdsForIndustries = categories.map((cat) => cat.id);
      const categoriesWithIndustries = await Category.findAll({
        where: { id: { [Op.in]: categoryIdsForIndustries } },
        include: [
          {
            model: Industry,
            as: "industries",
            attributes: ["id", "name", "description"],
            through: { attributes: [] },
          },
        ],
      });

      // Merge prompt_count vào categories
      const categoriesMap = {};
      categories.forEach((cat) => {
        categoriesMap[cat.id] = cat.toJSON();
      });

      const modifiedCategories = categoriesWithIndustries.map((category) => {
        const categoryData = category.toJSON();
        const promptData = categoriesMap[category.id];
        if (promptData) {
          categoryData.prompt_count = promptData.prompt_count;
        }
        if (categoryData.section_id === 3) {
          categoryData.prompt_count = (categoryData.prompt_count || 0) * 10;
        }
        return categoryData;
      });

      const result = {
        section_id: sectionId,
        type: type || "all",
        industry_id: industry_id || "all",
        total: modifiedCategories.length,
        data: modifiedCategories,
      };

      return res.status(200).json(result);
    } else {
      // Không có industry filter, query bình thường
      categories = await Category.findAll({
        where: whereCondition,
        include: [
          {
            model: Prompt,
            attributes: [],
          },
          {
            model: Industry,
            as: "industries",
            attributes: ["id", "name", "description"],
            through: { attributes: [] },
          },
        ],
        attributes: {
          include: [
            [
              Sequelize.fn("COUNT", Sequelize.col("Prompts.id")),
              "prompt_count",
            ],
          ],
        },
        group: ["Category.id"],
        order: [
          [Sequelize.literal("is_comming_soon = 0"), "DESC"],
          ["created_at", "DESC"],
        ],
      });

      const modifiedCategories = categories.map((category) => {
        const categoryData = category.toJSON();
        if (categoryData.section_id === 3) {
          categoryData.prompt_count = categoryData.prompt_count * 10;
        }
        return categoryData;
      });

      const result = {
        section_id: sectionId,
        type: type || "all",
        industry_id: industry_id || "all",
        total: modifiedCategories.length,
        data: modifiedCategories,
      };

      res.status(200).json(result);
    }
  } catch (error) {
    res.status(500).json({
      message: "Error fetching categories by section",
      error: error.message,
    });
  }
});

module.exports = router;
