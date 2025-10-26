const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/authMiddleware");
const { sendFeedbackEmail } = require("../utils/emailService");
const { User } = require("../models");
const {
  sendDetailResponse,
  sendErrorResponse,
  sendInternalErrorResponse,
} = require("../utils/responseUtils");

/**
 * POST /api/feedback
 * API để gửi feedback từ người dùng đã đăng nhập
 * Nhận phone và name từ body, lấy email từ token
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { phone, name, message } = req.body;

    // Validation for required fields
    if (!phone || !name) {
      return sendErrorResponse(
        res,
        "Phone and name are required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Get user from token
    const userId = req.user.id;
    const user = await User.findByPk(userId);

    if (!user) {
      return sendErrorResponse(res, "User not found", "USER_NOT_FOUND", 404);
    }

    if (!user.email) {
      return sendErrorResponse(
        res,
        "User email not found",
        "EMAIL_NOT_FOUND",
        400
      );
    }

    // Send feedback email to quocdat.asean@gmail.com
    await sendFeedbackEmail(
      user.email,
      user.full_name || user.email,
      phone,
      name,
      message
    );

    sendDetailResponse(
      res,
      {
        message: "Feedback sent successfully",
        userEmail: user.email,
        feedbackName: name,
        feedbackPhone: phone,
        feedbackMessage: message,
      },
      "Feedback sent successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

module.exports = router;
