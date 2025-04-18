const express = require("express");
const router = express.Router();
const { Op, Sequelize } = require("sequelize");
const Category = require("../models/Category");
const Section = require("../models/Section");
const multer = require("multer");
const path = require("path");
const Prompt = require("../models/Prompt");
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

// Multer middleware: Cho phép upload tối đa 2 ảnh (image và image_card)
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn file tối đa 5MB
});

router.use("/upload", express.static("uploads")); // Cho phép truy cập ảnh đã upload

// API Upload ảnh (tên field: image và image_card)
router.post("/upload-images", upload.fields([{ name: "image" }, { name: "image_card" }]), (req, res) => {
    try {
        if (!req.files || (!req.files["image"] && !req.files["image_card"])) {
            return res.status(400).json({ message: "No files uploaded" });
        }

        // Lấy base URL của server
        const baseUrl = `${req.protocol}://${req.get("host")}`;

        // Trả về danh sách URL ảnh đầy đủ
        const imageUrls = {
            image: req.files["image"] ? `${baseUrl}/uploads/${req.files["image"][0].filename}` : null,
            image_card: req.files["image_card"] ? `${baseUrl}/uploads/${req.files["image_card"][0].filename}` : null,
        };

        res.status(200).json({
            message: "Files uploaded successfully",
            imageUrls: imageUrls,
        });
    } catch (error) {
        res.status(500).json({ message: "Error uploading files", error: error.message });
    }
});

// Get all categories with pagination
router.get("/", async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;

        // Create cache key based on query parameters
        // const cacheKey = `categories_list_${page}_${pageSize}`;

        // // Try to get from cache first
        // const cachedData = await cache.getCache(cacheKey);
        // if (cachedData) {
        //     return res.status(200).json(JSON.parse(cachedData));
        // }

        const offset = (page - 1) * pageSize;

        const { count, rows } = await Category.findAndCountAll({
            include: [{ model: Section, attributes: ["id", "name"] }],
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

        // Store in cache for 10 minutes (categories change less frequently)
        // await cache.setCache(cacheKey, JSON.stringify(result), 600);

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching categories", error: error.message });
    }
});

// Get category by id
router.get("/:id", async (req, res) => {
    try {
        const categoryId = req.params.id;

        // Create cache key
        const cacheKey = `category_detail_${categoryId}`;

        // Try to get from cache first
        const cachedData = await cache.getCache(cacheKey);
        if (cachedData) {
            return res.status(200).json(JSON.parse(cachedData));
        }

        const category = await Category.findByPk(categoryId, {
            include: [{ model: Section, attributes: ["id", "name"] }],
        });

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        // Store in cache for 30 minutes (category details change less frequently)
        await cache.setCache(cacheKey, JSON.stringify(category), 1800);

        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ message: "Error fetching category", error: error.message });
    }
});

// Create new category
router.post("/", upload.fields([{ name: "image" }, { name: "image_card" }]), async (req, res) => {
    try {
        const { name, description, section_id, is_comming_soon } = req.body;

        // Validate required fields
        if (!name || !section_id) {
            return res.status(400).json({ message: "Name and section_id are required" });
        }

        // Lấy URL của ảnh từ req.files
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const image = req.files["image"] ? `${baseUrl}/uploads/${req.files["image"][0].filename}` : null;
        const image_card = req.files["image_card"] ? `${baseUrl}/uploads/${req.files["image_card"][0].filename}` : null;

        if (!image || !image_card) {
            return res.status(400).json({ message: "Both image and image_card are required" });
        }

        const newCategory = await Category.create({
            name,
            image,
            description,
            image_card,
            section_id,
            is_comming_soon
        });

        // Invalidate relevant caches
        // await Promise.all([
        //     cache.invalidateCache(`categories_list_*`),
        //     cache.invalidateCache(`categories_by_section_${section_id}*`),
        // ]);

        res.status(201).json(newCategory);
    } catch (error) {
        res.status(500).json({ message: "Error creating category", error: error.message });
    }
});

// Update category
router.put("/:id", upload.fields([{ name: "image" }, { name: "image_card" }]), async (req, res) => {
    try {
        const categoryId = req.params.id;
        const { name, description, section_id, is_comming_soon } = req.body;

        const category = await Category.findByPk(categoryId);
        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        const oldSectionId = category.section_id;
        const newSectionId = section_id || oldSectionId;

        // Lấy URL của ảnh từ req.files (nếu có)
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const image = req.files["image"] ? `${baseUrl}/uploads/${req.files["image"][0].filename}` : category.image;
        const image_card = req.files["image_card"] ? `${baseUrl}/uploads/${req.files["image_card"][0].filename}` : category.image_card;

        await category.update({
            name: name || category.name,
            image,
            description: description || category.description,
            image_card,
            section_id: newSectionId,
            is_comming_soon: is_comming_soon || category.name
        });

        // Invalidate relevant caches
        // await Promise.all([
        //     cache.invalidateCache(`category_detail_${categoryId}`),
        //     cache.invalidateCache(`categories_list_*`),
        //     cache.invalidateCache(`categories_by_section_${oldSectionId}*`),
        //     cache.invalidateCache(`categories_by_section_${newSectionId}*`),
        // ]);

        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ message: "Error updating category", error: error.message });
    }
});

// Delete category
router.delete("/:id", async (req, res) => {
    try {
        const categoryId = req.params.id;
        const category = await Category.findByPk(categoryId);

        if (!category) {
            return res.status(404).json({ message: "Category not found" });
        }

        const sectionId = category.section_id;

        await category.destroy();

        // Invalidate relevant caches
        await Promise.all([
            cache.invalidateCache(`category_detail_${categoryId}`),
            cache.invalidateCache(`categories_list_*`),
            cache.invalidateCache(`categories_by_section_${sectionId}*`),
        ]);

        res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting category", error: error.message });
    }
});

router.get("/by-sectionId/:sectionId", async (req, res) => {
    try {
        const { sectionId } = req.params;
        const searchTxt = req.query.searchTxt;
        const listCategory = req.query.listCategory;

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
        if (searchTxt && searchTxt != null && searchTxt != "") {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${searchTxt}%` } },
                { name: { [Op.like]: `%${searchTxt.toLowerCase()}%` } },
                { name: { [Op.like]: `%${searchTxt.toUpperCase()}%` } },
            ];
        }

        if (listCategory && listCategory != null && listCategory != "" && listCategory != "null") {
            // Tách chuỗi thành mảng số nguyên
            const categoryIds = listCategory.split(',').map(id => parseInt(id.trim(), 10));

            // Nếu là mảng id của category
            if (categoryIds.length > 0) {
                whereCondition.id = {
                    [Op.in]: categoryIds
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
                [Sequelize.literal("is_comming_soon = 0"), "DESC"],  // false lên trước
                ["created_at", "DESC"],
              ],
              
            
        });

        const modifiedCategories = categories.map(category => {
            const categoryData = category.toJSON(); // Chuyển instance Sequelize thành object
            if (categoryData.section_id === 3) {
                categoryData.prompt_count = categoryData.prompt_count * 10;
            }
            return categoryData;
        });

        const result = {
            section_id: sectionId,
            total: modifiedCategories.length,
            data: modifiedCategories,
        };

        // Cache for 10 minutes
        // await cache.setCache(cacheKey, JSON.stringify(result), 600);

        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ message: "Error fetching categories by section", error: error.message });
    }
});

module.exports = router;