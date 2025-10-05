const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Section = require("../models/Section");
const multer = require("multer");
const path = require("path");
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

// Custom transform function for Product data
const transformProductData = (data) => {
  // First apply camelCase transformation
  const camelCaseData = transformToCamelCase(data);

  // Then apply custom field renaming
  if (Array.isArray(camelCaseData)) {
    return camelCaseData.map((item) => transformProductData(item));
  }

  if (camelCaseData && typeof camelCaseData === "object") {
    const transformed = { ...camelCaseData };

    // Rename Section to section
    if (transformed.Section !== undefined) {
      transformed.section = transformed.Section;
      delete transformed.Section;
    }

    return transformed;
  }

  return camelCaseData;
};
const uploadDir = path.join(__dirname, "../uploads");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "/var/www/promvn/uploads");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
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

// Multer middleware: Cho phép upload 1 ảnh (field "image")
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn file tối đa 50MB
});

router.use("/uploads", express.static(uploadDir)); // Cho phép truy cập ảnh đã upload

// GET: Lấy tất cả Product theo trang
router.get("/", async (req, res) => {
  try {
    const { page, pageIndex, pageSize = 10, limit: queryLimit } = req.query;

    const currentPage = parseInt(page || pageIndex) || 1;
    const limit = parseInt(queryLimit) || parseInt(pageSize) || 10;
    const offset = (currentPage - 1) * limit;

    // Get total count without includes
    const totalCount = await Product.count();

    // Get actual data with includes
    const rows = await Product.findAll({
      offset,
      limit,
      include: [{ model: Section, attributes: ["id", "name", "description"] }],
      order: [["created_at", "DESC"]],
    });

    const pagination = calculatePagination(totalCount, currentPage, limit);
    sendListResponse(res, transformProductData(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, "Error fetching products: " + error.message);
  }
});

// GET: Lấy Product theo ID
router.get("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findByPk(productId, {
      include: [{ model: Section, attributes: ["id", "name"] }],
    });

    if (!product) {
      return sendNotFoundResponse(res, "Product not found");
    }

    sendDetailResponse(res, transformProductData(product));
  } catch (error) {
    sendInternalErrorResponse(res, "Error fetching product: " + error.message);
  }
});

// POST: Tạo mới Product với upload ảnh
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, link, section_id, sectionId } = req.body;
      const finalSectionId = sectionId || section_id;

      // Validate required fields
      if (!name || !link || !finalSectionId) {
        return sendErrorResponse(
          res,
          "Name, link, and section_id are required",
          "VALIDATION_ERROR",
          400
        );
      }

      // Kiểm tra section_id có tồn tại không
      const section = await Section.findByPk(finalSectionId);
      if (!section) {
        return sendNotFoundResponse(res, "Section not found");
      }

      // Lấy URL của ảnh từ req.file (nếu có)
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const image = req.file ? `${baseUrl}/uploads/${req.file.filename}` : null;

      const newProduct = await Product.create({
        name,
        link,
        image,
        section_id: finalSectionId,
      });

      sendCreateResponse(
        res,
        transformProductData(newProduct),
        "Product created successfully"
      );
    } catch (error) {
      sendInternalErrorResponse(
        res,
        "Error creating product: " + error.message
      );
    }
  }
);

// PUT: Cập nhật Product với upload ảnh
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  upload.single("image"),
  async (req, res) => {
    try {
      const productId = req.params.id;
      const { name, link, section_id, sectionId } = req.body;
      const finalSectionId = sectionId || section_id;

      const product = await Product.findByPk(productId);
      if (!product) {
        return sendNotFoundResponse(res, "Product not found");
      }

      // Kiểm tra section_id nếu được cung cấp
      if (finalSectionId) {
        const section = await Section.findByPk(finalSectionId);
        if (!section) {
          return sendNotFoundResponse(res, "Section not found");
        }
      }

      // Lấy URL của ảnh từ req.file (nếu có), hoặc từ body, nếu không giữ nguyên ảnh cũ
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      let image = product.image; // Giữ nguyên ảnh cũ làm mặc định

      if (req.file) {
        // Nếu có file upload mới
        image = `${baseUrl}/uploads/${req.file.filename}`;
      } else if (req.body.image !== undefined) {
        // Nếu có image URL trong body
        image = req.body.image;
      }

      await product.update({
        name: name || product.name,
        link: link || product.link,
        image,
        section_id:
          finalSectionId !== undefined ? finalSectionId : product.section_id,
      });

      const updatedProduct = await Product.findByPk(productId, {
        include: [{ model: Section, attributes: ["id", "name"] }],
      });

      sendUpdateResponse(
        res,
        transformProductData(updatedProduct),
        "Product updated successfully"
      );
    } catch (error) {
      sendInternalErrorResponse(
        res,
        "Error updating product: " + error.message
      );
    }
  }
);

// DELETE: Xóa Product
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findByPk(productId);

    if (!product) {
      return sendNotFoundResponse(res, "Product not found");
    }

    await product.destroy();
    sendDeleteResponse(res, "Product deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(res, "Error deleting product: " + error.message);
  }
});

module.exports = router;
