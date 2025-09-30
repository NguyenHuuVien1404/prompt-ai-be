const express = require("express");
const router = express.Router();
const Section = require("../models/Section");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
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
const transformToCamelCase = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(transformToCamelCase);
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      transformed[camelKey] = transformToCamelCase(value);
    } else if (Array.isArray(value)) {
      transformed[camelKey] = value.map(transformToCamelCase);
    } else {
      transformed[camelKey] = value;
    }
  }
  return transformed;
};
// Lấy danh sách section
router.get("/", async (req, res) => {
  try {
    const sections = await Section.findAll();
    sendListResponse(
      res,
      transformToCamelCase(sections),
      calculatePagination(sections.length, 1, sections.length)
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

module.exports = router;
