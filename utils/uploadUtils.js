/**
 * Common utilities for file upload handling
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");

/**
 * Create multer storage configuration
 * @param {string} destination - Upload destination directory
 * @returns {Object} Multer storage configuration
 */
const createStorage = (destination = "/var/www/promvn/uploads") => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(destination)) {
        fs.mkdirSync(destination, { recursive: true });
      }
      cb(null, destination);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const uniqueName =
        Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
      cb(null, uniqueName);
    },
  });
};

/**
 * File filter for images
 * @param {Object} req - Express request
 * @param {Object} file - Uploaded file
 * @param {Function} cb - Callback function
 */
const imageFilter = (req, file, cb) => {
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
        "Invalid file type. Only common image formats (JPG, PNG, GIF, BMP, WebP, TIFF, SVG, HEIC, HEIF) are allowed."
      ),
      false
    );
  }
};

/**
 * Create multer upload middleware
 * @param {Object} options - Upload options
 * @returns {Object} Multer middleware
 */
const createUploadMiddleware = (options = {}) => {
  const {
    destination = "/var/www/promvn/uploads",
    maxSize = 5 * 1024 * 1024, // 5MB
    fileFilter = imageFilter,
    fields = [{ name: "image" }],
  } = options;

  const storage = createStorage(destination);

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxSize,
    },
  });
};

/**
 * Handle upload errors
 * @param {Object} res - Express response
 * @param {Object} err - Error object
 * @param {Function} sendErrorResponse - Error response function
 */
const handleUploadError = (res, err, sendErrorResponse) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendErrorResponse(
        res,
        "File size too large. Max size is 5MB",
        "VALIDATION_ERROR",
        400
      );
    }
    return sendErrorResponse(res, err.message, "VALIDATION_ERROR", 400);
  } else if (err) {
    return sendErrorResponse(res, err.message, "VALIDATION_ERROR", 400);
  }
};

/**
 * Generate file URLs
 * @param {Object} req - Express request
 * @param {Array} files - Uploaded files
 * @param {string} basePath - Base path for URLs
 * @returns {Array} Array of file URLs
 */
const generateFileUrls = (req, files, basePath = "/uploads") => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;

  if (Array.isArray(files)) {
    return files.map((file) => `${baseUrl}${basePath}/${file.filename}`);
  }

  // Handle single file
  return `${baseUrl}${basePath}/${files.filename}`;
};

/**
 * Generate image URLs for multiple fields
 * @param {Object} req - Express request
 * @param {Object} fileFields - File fields object
 * @param {string} basePath - Base path for URLs
 * @returns {Object} Object with image URLs
 */
const generateImageUrls = (req, fileFields, basePath = "/uploads") => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const imageUrls = {};

  Object.keys(fileFields).forEach((fieldName) => {
    if (fileFields[fieldName] && fileFields[fieldName][0]) {
      imageUrls[
        fieldName
      ] = `${baseUrl}${basePath}/${fileFields[fieldName][0].filename}`;
    } else {
      imageUrls[fieldName] = null;
    }
  });

  return imageUrls;
};

/**
 * Clean up uploaded files on error
 * @param {Array|Object} files - Files to clean up
 */
const cleanupFiles = (files) => {
  if (!files) return;

  const fileArray = Array.isArray(files) ? files : [files];

  fileArray.forEach((file) => {
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (error) {
        console.error("Error cleaning up file:", error);
      }
    }
  });
};

module.exports = {
  createStorage,
  imageFilter,
  createUploadMiddleware,
  handleUploadError,
  generateFileUrls,
  generateImageUrls,
  cleanupFiles,
};
