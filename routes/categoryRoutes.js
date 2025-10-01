const express = require("express");
const router = express.Router();
const { Op, Sequelize } = require("sequelize");
const Category = require("../models/Category");
const Section = require("../models/Section");
const multer = require("multer");
const path = require("path");
const Prompt = require("../models/Prompt");
const Topic = require("../models/Topic");
const Industry = require("../models/Industry");
const CategoryIndustry = require("../models/CategoryIndustry");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const cache = require("../utils/cache");
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

// Utility function to convert snake_case to camelCase
const toCamelCase = (str) => {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

// Utility function to transform object fields from snake_case to camelCase
const transformToCamelCase = (obj, seen = new WeakSet()) => {
  if (!obj || typeof obj !== "object") return obj;

  // Check for circular reference
  if (seen.has(obj)) return obj;
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => transformToCamelCase(item, seen));
  }

  // Handle Sequelize instances - convert to plain object first
  if (obj.toJSON && typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      transformed[camelKey] = transformToCamelCase(value, seen);
    } else if (Array.isArray(value)) {
      transformed[camelKey] = value.map((item) =>
        transformToCamelCase(item, seen)
      );
    } else {
      transformed[camelKey] = value;
    }
  }
  return transformed;
};

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
  limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn file tối đa 50MB
});

router.use("/upload", express.static("uploads")); // Cho phép truy cập ảnh đã upload

// API Upload ảnh (tên field: image và image_card)
router.post(
  "/upload-images",
  upload.fields([{ name: "image" }, { name: "image_card" }]),
  (req, res) => {
    try {
      if (!req.files || (!req.files["image"] && !req.files["image_card"])) {
        return sendErrorResponse(
          res,
          "No files uploaded",
          "VALIDATION_ERROR",
          400
        );
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

      sendCreateResponse(
        res,
        transformToCamelCase({ imageUrls }),
        "Files uploaded successfully"
      );
    } catch (error) {
      sendInternalErrorResponse(res, "Error uploading files: " + error.message);
    }
  }
);

// Get all categories with pagination and filters
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.pageIndex || req.query.page) || 1;
    const pageSize =
      parseInt(req.query.limit) || parseInt(req.query.pageSize) || 10;
    const type = req.query.type;
    const sectionId = req.query.sectionId;
    const isCommingSoon = req.query.isCommingSoon;
    const searchTxt = req.query.searchTxt;
    const topicId = req.query.topicId; // Thêm topicId filtering
    const industryId = req.query.industryId; // Thêm industryId filtering

    const offset = (page - 1) * pageSize;

    let whereCondition = {};

    // Filter theo type
    if (type && ["free", "premium"].includes(type)) {
      whereCondition.type = type;
    }

    // Filter theo section_id
    if (sectionId && !isNaN(parseInt(sectionId))) {
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

    // Handle topicId filtering
    let topicFilter = {};
    if (topicId) {
      const topicIds = Array.isArray(topicId)
        ? topicId
        : topicId
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));

      if (topicIds.length > 0) {
        topicFilter = {
          id: { [Op.in]: topicIds },
        };
      }
    }

    // Handle industryId filtering
    let industryFilter = {};
    if (industryId) {
      const industryIds = Array.isArray(industryId)
        ? industryId
        : industryId
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));

      if (industryIds.length > 0) {
        industryFilter = {
          id: { [Op.in]: industryIds },
        };
      }
    }

    // Build include options
    const includeOptions = [
      { model: Section, as: "section", attributes: ["id", "name"] },
      {
        model: Industry,
        as: "industries",
        attributes: ["id", "name", "description"],
        through: { attributes: [] },
        ...(Object.keys(industryFilter).length > 0
          ? { where: industryFilter, required: true }
          : {}),
      },
    ];

    // Add topic filtering if needed
    if (Object.keys(topicFilter).length > 0) {
      includeOptions.push({
        model: Prompt,
        attributes: [],
        where: topicFilter,
        required: true,
      });
    }

    // Get total count without includes to avoid JOIN counting issues
    const totalCount = await Category.count({ where: whereCondition });

    // Get actual data with includes
    const rows = await Category.findAll({
      where: whereCondition,
      include: includeOptions,
      limit: pageSize,
      offset: offset,
      order: [["created_at", "DESC"]],
    });

    const pagination = calculatePagination(totalCount, page, pageSize);

    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    console.error("Error in GET /api/categories:", error);
    sendInternalErrorResponse(
      res,
      "Error fetching categories: " + error.message
    );
  }
});

// Get category by id
router.get("/:id", async (req, res) => {
  try {
    const categoryId = req.params.id;

    const category = await Category.findByPk(categoryId, {
      include: [
        { model: Section, as: "section", attributes: ["id", "name"] },
        {
          model: Industry,
          as: "industries",
          attributes: ["id", "name", "description"],
          through: { attributes: [] },
        },
      ],
    });

    if (!category) {
      return sendNotFoundResponse(res, "Category not found");
    }

    sendDetailResponse(res, transformToCamelCase(category));
  } catch (error) {
    console.error("Error in GET /api/categories/:id:", error);
    sendInternalErrorResponse(res, "Error fetching category: " + error.message);
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
        return sendErrorResponse(
          res,
          "Name and section_id are required",
          "VALIDATION_ERROR",
          400
        );
      }

      // Validate type field
      if (category_type && !["free", "premium"].includes(category_type)) {
        return sendErrorResponse(
          res,
          "Type must be either 'free' or 'premium'",
          "VALIDATION_ERROR",
          400
        );
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

      sendCreateResponse(
        res,
        transformToCamelCase(newCategory),
        "Category created successfully"
      );
    } catch (error) {
      sendInternalErrorResponse(
        res,
        "Error creating category: " + error.message
      );
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

      const {
        name,
        description,
        section_id,
        is_comming_soon,
        category_type,
        industry_ids,
      } = formData;

      const category = await Category.findByPk(categoryId);

      if (!category) {
        return sendNotFoundResponse(res, "Category not found");
      }

      // Validate type field if provided
      if (category_type && !["free", "premium"].includes(category_type)) {
        return sendErrorResponse(
          res,
          "Type must be either 'free' or 'premium'",
          "VALIDATION_ERROR",
          400
        );
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
        section_id: !isNaN(parseInt(newSectionId))
          ? parseInt(newSectionId)
          : oldSectionId,
        is_comming_soon:
          is_comming_soon !== undefined
            ? parseBoolean(is_comming_soon)
            : category.is_comming_soon,
        type: category_type !== undefined ? category_type : category.type,
      };

      await category.update(updateData);

      // Handle industry_ids update if provided
      if (industry_ids !== undefined) {
        // Parse industry_ids (comma-separated string or array)
        let industryIdsArray = [];
        if (typeof industry_ids === "string" && industry_ids.trim() !== "") {
          industryIdsArray = industry_ids
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));
        } else if (Array.isArray(industry_ids)) {
          industryIdsArray = industry_ids
            .map((id) => parseInt(id))
            .filter((id) => !isNaN(id));
        }

        // Update category-industry relationships
        if (industryIdsArray.length > 0) {
          // Remove existing relationships
          await CategoryIndustry.destroy({
            where: { category_id: categoryId },
          });

          // Create new relationships
          const industryRelations = industryIdsArray.map((industryId) => ({
            category_id: categoryId,
            industry_id: industryId,
          }));

          await CategoryIndustry.bulkCreate(industryRelations);
        } else {
          // If empty industry_ids, remove all relationships
          await CategoryIndustry.destroy({
            where: { category_id: categoryId },
          });
        }
      }

      // Get updated category with industries
      const updatedCategory = await Category.findByPk(categoryId, {
        include: [
          { model: Section, as: "section", attributes: ["id", "name"] },
          {
            model: Industry,
            as: "industries",
            attributes: ["id", "name", "description"],
            through: { attributes: [] },
          },
        ],
      });

      sendUpdateResponse(
        res,
        transformToCamelCase(updatedCategory),
        "Category updated successfully"
      );
    } catch (error) {
      console.error("Error in PUT /api/categories/:id:", error);
      sendInternalErrorResponse(
        res,
        "Error updating category: " + error.message
      );
    }
  }
);

// Delete category
router.delete("/:id", async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await Category.findByPk(categoryId);

    if (!category) {
      return sendNotFoundResponse(res, "Category not found");
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

    sendDeleteResponse(res, "Category deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(res, "Error deleting category: " + error.message);
  }
});

// Get categories by type (free/premium)
router.get("/by-type/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const page = parseInt(req.query.pageIndex || req.query.page) || 1;
    const pageSize =
      parseInt(req.query.limit) || parseInt(req.query.pageSize) || 10;

    // Validate type parameter
    if (!["free", "premium"].includes(type)) {
      return sendErrorResponse(
        res,
        "Type must be either 'free' or 'premium'",
        "VALIDATION_ERROR",
        400
      );
    }

    const offset = (page - 1) * pageSize;

    // Get total count without includes
    const totalCount = await Category.count({ where: { type } });

    // Get actual data with includes
    const rows = await Category.findAll({
      where: { type },
      include: [{ model: Section, as: "section", attributes: ["id", "name"] }],
      limit: pageSize,
      offset: offset,
      order: [["created_at", "DESC"]],
    });

    const pagination = calculatePagination(totalCount, page, pageSize);

    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Error fetching categories by type: " + error.message
    );
  }
});

// Get categories by sectionId with type filtering and industry filtering
// Get categories by sectionId with type filtering and industry filtering
router.get("/by-sectionId/:sectionId", async (req, res) => {
  try {
    const { sectionId } = req.params;
    const searchTxt = req.query.searchTxt;
    const listCategory = req.query.listCategory;
    const type = req.query.type;
    const industry_id = req.query.industry_id; // Thêm industry filtering

    // Validate sectionId
    const parsedSectionId = parseInt(sectionId);
    if (isNaN(parsedSectionId)) {
      return sendErrorResponse(
        res,
        "Invalid sectionId",
        "VALIDATION_ERROR",
        400
      );
    }

    let whereCondition = { section_id: parsedSectionId };

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
        const pagination = calculatePagination(0, 1, 10);
        return sendListResponse(res, transformToCamelCase([]), pagination);
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

      const pagination = calculatePagination(
        modifiedCategories.length,
        1,
        modifiedCategories.length
      );

      return sendListResponse(
        res,
        transformToCamelCase(modifiedCategories),
        pagination
      );
    } else {
      // Không có industry filter, query bình thường (không include industries trong GROUP BY)
      categories = await Category.findAll({
        where: whereCondition,
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

      // Load industries riêng cho kết quả
      const categoryIds = categories.map((cat) => cat.id);
      const categoriesWithIndustries = await Category.findAll({
        where: { id: { [Op.in]: categoryIds } },
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

      const pagination = calculatePagination(
        modifiedCategories.length,
        1,
        modifiedCategories.length
      );

      sendListResponse(
        res,
        transformToCamelCase(modifiedCategories),
        pagination
      );
    }
  } catch (error) {
    console.error("Error in /by-sectionId/:sectionId:", error);
    sendInternalErrorResponse(
      res,
      "Error fetching categories by section: " + error.message
    );
  }
});

module.exports = router;
