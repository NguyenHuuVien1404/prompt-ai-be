const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  sendCreateResponse,
  sendErrorResponse,
  sendInternalErrorResponse,
} = require("../utils/responseUtils");

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
    // Tạo tên file mới với timestamp và random number
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + ext);
  },
});

// Kiểm tra file type - chỉ cho phép upload ảnh
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/bmp",
    "image/webp",
    "image/tiff",
    "image/svg+xml",
    "image/heic",
    "image/heif",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only image formats (JPG, PNG, GIF, BMP, WebP, TIFF, SVG, HEIC, HEIF) are allowed."
      ),
      false
    );
  }
};

// Cấu hình multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // Giới hạn 10MB
  },
});

// Middleware để serve static files
router.use("/uploads", express.static("/var/www/promvn/uploads"));

/**
 * @route POST /api/upload
 * @desc Upload single image file and return URL
 * @access Public
 */
router.post("/", upload.single("image"), (req, res) => {
  try {
    // Kiểm tra xem có file được upload không
    if (!req.file) {
      return sendErrorResponse(
        res,
        "No image file uploaded",
        "VALIDATION_ERROR",
        400
      );
    }

    // Lấy base URL của server
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Tạo URL đầy đủ cho ảnh đã upload
    const imageUrl = `${baseUrl}/api/upload/uploads/${req.file.filename}`;

    // Trả về URL dạng string
    sendCreateResponse(res, { imageUrl }, "Image uploaded successfully");
  } catch (error) {
    sendInternalErrorResponse(res, "Error uploading image: " + error.message);
  }
});

/**
 * @route POST /api/upload/multiple
 * @desc Upload multiple image files and return URLs array
 * @access Public
 */
router.post("/multiple", upload.array("images", 10), (req, res) => {
  try {
    // Kiểm tra xem có file được upload không
    if (!req.files || req.files.length === 0) {
      return sendErrorResponse(
        res,
        "No image files uploaded",
        "VALIDATION_ERROR",
        400
      );
    }

    // Lấy base URL của server
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Tạo array các URL cho tất cả ảnh đã upload
    const imageUrls = req.files.map(
      (file) => `${baseUrl}/api/upload/uploads/${file.filename}`
    );

    // Trả về array các URL
    sendCreateResponse(res, { imageUrls }, "Images uploaded successfully");
  } catch (error) {
    sendInternalErrorResponse(res, "Error uploading images: " + error.message);
  }
});

module.exports = router;
