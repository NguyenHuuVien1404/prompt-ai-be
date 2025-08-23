const express = require("express");
const router = express.Router();
const { Op, Sequelize } = require("sequelize");
const sequelize = require("../config/database");
const Category = require("../models/Category");
const Section = require("../models/Section");
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

    console.log("=== GET CATEGORIES LIST DEBUG ===");
    console.log("Query parameters:", {
      page,
      pageSize,
      type,
      sectionId,
      isCommingSoon,
      searchTxt,
    });

    console.log("Always fetching fresh data from database (no cache)");
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

    console.log("Where condition:", JSON.stringify(whereCondition, null, 2));

    const { count, rows } = await Category.findAndCountAll({
      where: whereCondition,
      include: [{ model: Section, attributes: ["id", "name"] }],
      limit: pageSize,
      offset: offset,
      order: [["created_at", "DESC"]],
    });

    console.log(`Found ${count} categories, returning ${rows.length} rows`);

    // Log first few categories for debugging
    if (rows.length > 0) {
      console.log("Sample categories data:");
      rows.slice(0, 3).forEach((cat, index) => {
        console.log(`Category ${index + 1}:`, {
          id: cat.id,
          name: cat.name,
          type: cat.type,
          section_id: cat.section_id,
          is_comming_soon: cat.is_comming_soon,
        });
      });

      // Special check for category 55
      const category55 = rows.find((cat) => cat.id === 55);
      if (category55) {
        console.log("=== SPECIAL CHECK: Category 55 in list ===");
        console.log("Category 55 from list:", {
          id: category55.id,
          name: category55.name,
          type: category55.type,
          section_id: category55.section_id,
        });
      }
    }

    const result = {
      total: count,
      page,
      pageSize,
      filters: { type, sectionId, isCommingSoon, searchTxt },
      data: rows,
    };

    // No caching - always fresh data
    console.log("Categories list returned (no cache)");

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res
      .status(500)
      .json({ message: "Error fetching categories", error: error.message });
  }
});

// Get category by id
router.get("/:id", async (req, res) => {
  try {
    const categoryId = req.params.id;

    console.log(
      `Always fetching category ${categoryId} from database (no cache)`
    );
    const category = await Category.findByPk(categoryId, {
      include: [{ model: Section, attributes: ["id", "name"] }],
    });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    console.log(`Category ${categoryId} from database:`, {
      id: category.id,
      name: category.name,
      type: category.type,
      section_id: category.section_id,
      is_comming_soon: category.is_comming_soon,
      image: category.image,
      image_card: category.image_card,
      description: category.description,
      created_at: category.created_at,
      updated_at: category.updated_at,
    });

    // Special check for category 55
    if (categoryId == 55) {
      console.log("=== SPECIAL CHECK: Category 55 detail ===");
      console.log("Category 55 from detail:", {
        id: category.id,
        name: category.name,
        type: category.type,
        section_id: category.section_id,
      });
    }

    // No caching - always fresh data
    console.log(`Category ${categoryId} returned (no cache)`);

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

      // Debug logging
      console.log("=== UPDATE CATEGORY DEBUG ===");
      console.log("Category ID:", categoryId);
      console.log("Raw req.body:", req.body);
      console.log("req.files:", req.files);

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
        console.log("Warning: req.body is empty, this might cause issues");
      }

      const { name, description, section_id, is_comming_soon, category_type } =
        formData;

      // Debug parsed values
      console.log("Parsed values:");
      console.log("- name:", name, "type:", typeof name);
      console.log("- description:", description, "type:", typeof description);
      console.log("- section_id:", section_id, "type:", typeof section_id);
      console.log(
        "- is_comming_soon:",
        is_comming_soon,
        "type:",
        typeof is_comming_soon
      );
      console.log(
        "- category_type:",
        category_type,
        "type:",
        typeof category_type
      );

      // Additional debugging for form data
      console.log("Full formData object:", formData);
      console.log("All keys in formData:", Object.keys(formData));

      // Force a fresh database query
      const category = await Category.findByPk(categoryId, {
        // Force a fresh query from database
        lock: false,
        skipLocked: false,
      });

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Also check raw database value
      const rawResult = await sequelize.query(
        "SELECT id, name, type, section_id, is_comming_soon FROM categories WHERE id = ?",
        {
          replacements: [categoryId],
          type: sequelize.QueryTypes.SELECT,
        }
      );

      console.log("Raw database query result:", rawResult);

      console.log("Current category data from model:", {
        id: category.id,
        name: category.name,
        type: category.type,
        is_comming_soon: category.is_comming_soon,
      });

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

      console.log("Update data to be applied:", updateData);

      // Check if there are actual changes
      const hasChanges = Object.keys(updateData).some((key) => {
        if (key === "image" || key === "image_card") return false; // Skip image fields for comparison

        const oldValue = category[key];
        const newValue = updateData[key];
        const isDifferent = oldValue !== newValue;

        console.log(`Comparing ${key}:`, { oldValue, newValue, isDifferent });

        return isDifferent;
      });

      console.log("Has changes:", hasChanges);
      if (hasChanges) {
        console.log("Changes detected, updating category...");
      } else {
        console.log("No changes detected, category already has these values");
      }

      await category.update(updateData);

      // Refresh category data after update
      await category.reload();

      console.log("Category after update:", {
        id: category.id,
        name: category.name,
        type: category.type,
        is_comming_soon: category.is_comming_soon,
        section_id: category.section_id,
      });

      // No cache to invalidate - always fresh data
      console.log("No cache invalidation needed - always fresh data");

      res.status(200).json(category);
    } catch (error) {
      console.error("Error updating category:", error);
      res
        .status(500)
        .json({ message: "Error updating category", error: error.message });
    }
  }
);

// Delete category
router.delete("/:id", async (req, res) => {
  try {
    console.log("Start DELETE /:id");
    const categoryId = req.params.id;
    const category = await Category.findByPk(categoryId);
    console.log("Category found:", category);

    if (!category) {
      console.log("Category not found");
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const sectionId = category.section_id;
    const categoryName = category.name;

    await category.destroy();
    console.log("Category destroyed");

    // Invalidate relevant caches (tạm thời comment lại để kiểm tra lỗi treo)
    // await Promise.all([
    //     cache.invalidateCache(`category_detail_${categoryId}`),
    //     cache.invalidateCache(`categories_list_*`),
    //     cache.invalidateCache(`categories_by_section_${sectionId}*`),
    // ]);
    // console.log("Cache invalidated");

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
      data: {
        id: categoryId,
        name: categoryName,
        section_id: sectionId,
      },
    });
    console.log("Response sent");
  } catch (error) {
    console.error("Error deleting category:", error);
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

    console.log("=== GET CATEGORIES BY TYPE DEBUG ===");
    console.log("Type:", type);
    console.log("Pagination:", { page, pageSize });

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

    console.log(
      `Found ${count} categories with type '${type}', returning ${rows.length} rows`
    );

    // Log sample data
    if (rows.length > 0) {
      console.log("Sample categories by type:");
      rows.slice(0, 3).forEach((cat, index) => {
        console.log(`Category ${index + 1}:`, {
          id: cat.id,
          name: cat.name,
          type: cat.type,
          section_id: cat.section_id,
        });
      });
    }

    const result = {
      type,
      total: count,
      page,
      pageSize,
      data: rows,
    };

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching categories by type:", error);
    res.status(500).json({
      message: "Error fetching categories by type",
      error: error.message,
    });
  }
});

// Get categories by sectionId with type filtering
router.get("/by-sectionId/:sectionId", async (req, res) => {
  try {
    const { sectionId } = req.params;
    const searchTxt = req.query.searchTxt;
    const listCategory = req.query.listCategory;
    const type = req.query.type; // Thêm filter theo type

    console.log("=== GET CATEGORIES BY SECTION DEBUG ===");
    console.log("Section ID:", sectionId);
    console.log("Query parameters:", { searchTxt, listCategory, type });

    // if (!sectionId) {
    //     return res.status(400).json({ error: "sectionId is required" });
    // }

    // // Create cache key based on parameters
    // const cacheKey = `categories_by_section_${sectionId}_${searchTxt || ''}_${listCategory || ''}`;

    // // Try to get from cache first
    // const cachedData = await cache.getCache(cacheKey);
    // if (cachedData) {
    //     return res.status(200).json(JSON.parse(cachedData));
    // }

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
      // Tách chuỗi thành mảng số nguyên
      const categoryIds = listCategory
        .split(",")
        .map((id) => parseInt(id.trim(), 10));

      // Nếu là mảng id của category
      if (categoryIds.length > 0) {
        whereCondition.id = {
          [Op.in]: categoryIds,
        };
      }
    }

    // Lấy danh sách categories theo sectionId và đếm số lượng prompts trong mỗi category
    const categories = await Category.findAll({
      where: whereCondition,
      include: [
        {
          model: Prompt,
          attributes: [], // Không lấy dữ liệu Prompt, chỉ lấy số lượng
        },
      ],
      attributes: {
        include: [
          [Sequelize.fn("COUNT", Sequelize.col("Prompts.id")), "prompt_count"],
        ],
      },
      group: ["Category.id"], // Nhóm theo Category để COUNT hoạt động chính xác
      order: [
        [Sequelize.literal("is_comming_soon = 0"), "DESC"], // false lên trước
        ["created_at", "DESC"],
      ],
    });

    console.log(
      `Found ${categories.length} categories for section ${sectionId}`
    );

    const modifiedCategories = categories.map((category) => {
      const categoryData = category.toJSON(); // Chuyển instance Sequelize thành object
      if (categoryData.section_id === 3) {
        categoryData.prompt_count = categoryData.prompt_count * 10;
      }
      return categoryData;
    });

    // Log sample data
    if (modifiedCategories.length > 0) {
      console.log("Sample categories by section:");
      modifiedCategories.slice(0, 3).forEach((cat, index) => {
        console.log(`Category ${index + 1}:`, {
          id: cat.id,
          name: cat.name,
          type: cat.type,
          section_id: cat.section_id,
          prompt_count: cat.prompt_count,
        });
      });
    }

    const result = {
      section_id: sectionId,
      type: type || "all", // Thêm thông tin về type filter
      total: modifiedCategories.length,
      data: modifiedCategories,
    };

    console.log("Result summary:", {
      section_id: result.section_id,
      type: result.type,
      total: result.total,
    });

    // No caching - always fresh data
    console.log("Categories by section returned (no cache)");

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching categories by section",
      error: error.message,
    });
  }
});

module.exports = router;
