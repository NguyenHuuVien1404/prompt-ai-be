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

// Import transform utilities
const { transformToCamelCase } = require("../utils/transformUtils");
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
