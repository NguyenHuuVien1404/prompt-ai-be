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
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn file tối đa 5MB
});

router.use("/uploads", express.static(uploadDir)); // Cho phép truy cập ảnh đã upload

// GET: Lấy tất cả Product theo trang
router.get("/", async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;

    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    const { count, rows } = await Product.findAndCountAll({
      offset,
      limit,
      include: [{ model: Section, attributes: ["id", "name", "description"] }],
      order: [["created_at", "DESC"]],
    });

    res.status(200).json({
      data: rows,
      total: count,
      currentPage: parseInt(page),
      pageSize: limit,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching products", error: error.message });
  }
});

// GET: Lấy Product theo ID
router.get("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findByPk(productId, {
      approximatedinclude: [{ model: Section, attributes: ["id", "name"] }],
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json(product);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching product", error: error.message });
  }
});

// POST: Tạo mới Product với upload ảnh
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { name, link, section_id } = req.body;

    // Validate required fields
    if (!name || !link || !section_id) {
      return res.status(400).json({
        message: "Name, link, and section_id are required",
      });
    }

    // Kiểm tra section_id có tồn tại không
    const section = await Section.findByPk(section_id);
    if (!section) {
      return res.status(404).json({ message: "Section not found" });
    }

    // Lấy URL của ảnh từ req.file (nếu có)
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const image = req.file ? `${baseUrl}/uploads/${req.file.filename}` : null;

    const newProduct = await Product.create({
      name,
      link,
      image,
      section_id,
    });

    res.status(201).json(newProduct);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating product", error: error.message });
  }
});

// PUT: Cập nhật Product với upload ảnh
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, link, section_id } = req.body;

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Kiểm tra section_id nếu được cung cấp
    if (section_id) {
      const section = await Section.findByPk(section_id);
      if (!section) {
        return res.status(404).json({ message: "Section not found" });
      }
    }

    // Lấy URL của ảnh từ req.file (nếu có), nếu không giữ nguyên ảnh cũ
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const image = req.file
      ? `${baseUrl}/uploads/${req.file.filename}`
      : product.image;

    await product.update({
      name: name || product.name,
      link: link || product.link,
      image,
      section_id: section_id !== undefined ? section_id : product.section_id,
    });

    const updatedProduct = await Product.findByPk(productId, {
      include: [{ model: Section, attributes: ["id", "name"] }],
    });

    res.status(200).json(updatedProduct);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating product", error: error.message });
  }
});

// DELETE: Xóa Product
router.delete("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findByPk(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    await product.destroy();
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting product", error: error.message });
  }
});

module.exports = router;
