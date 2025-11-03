const express = require("express");
const router = express.Router();
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const { adminOrMarketerMiddleware } = require("../middleware/roleMiddleware");
const { sendFeedbackEmail, sendReplyEmail } = require("../utils/emailService");
const { User, Feedback } = require("../models");
const { Op } = require("sequelize");
const {
  sendListResponse,
  sendDetailResponse,
  sendErrorResponse,
  sendInternalErrorResponse,
  sendCreateResponse,
  sendUpdateResponse,
  sendDeleteResponse,
  sendNotFoundResponse,
  calculatePagination,
} = require("../utils/responseUtils");
const { transformToCamelCase } = require("../utils/transformUtils");

// Lấy danh sách feedback với filtering và pagination - Chỉ admin/marketer mới có quyền
router.get("/", authMiddleware, adminOrMarketerMiddleware, async (req, res) => {
  try {
    const {
      page,
      pageIndex,
      pageSize = 10,
      status,
      statusIds: queryStatusIds,
    } = req.query;

    const currentPage = parseInt(page || pageIndex || 1);
    const limit = parseInt(pageSize);
    const offset = (currentPage - 1) * limit;

    const whereConditions = {};

    // Handle status filtering
    if (queryStatusIds) {
      let ids = [];
      if (typeof queryStatusIds === "string") {
        ids = queryStatusIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else if (Array.isArray(queryStatusIds)) {
        ids = queryStatusIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      }

      if (ids.length > 0) {
        whereConditions.status = { [Op.in]: ids };
      }
    } else if (status !== "" && status !== undefined && status !== null) {
      if (status === "processed" || status === "answered") {
        whereConditions.status = 2; // Đã xử lý
      } else if (status === "pending" || status === "unprocessed") {
        whereConditions.status = 1; // Chưa xử lý
      } else {
        const parsedStatus = parseInt(status);
        if (!isNaN(parsedStatus)) {
          whereConditions.status = parsedStatus;
        }
      }
    }

    const { count, rows } = await Feedback.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: User,
          attributes: ["id", "email", "full_name"],
        },
      ],
      limit,
      offset,
      order: [["created_at", "DESC"]],
    });

    const pagination = calculatePagination(count, currentPage, limit);
    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy chi tiết feedback theo ID - Chỉ admin/marketer mới có quyền
router.get(
  "/:id",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id || isNaN(id)) {
        return sendErrorResponse(
          res,
          "Invalid feedback ID",
          "VALIDATION_ERROR",
          400
        );
      }

      const feedback = await Feedback.findByPk(id, {
        include: [
          {
            model: User,
            attributes: ["id", "email", "full_name"],
          },
        ],
      });

      if (!feedback) {
        return sendNotFoundResponse(res, "Feedback not found");
      }

      sendDetailResponse(res, transformToCamelCase(feedback));
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

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

    // Lưu feedback vào database
    const newFeedback = await Feedback.create({
      user_id: userId,
      email: user.email,
      full_name: user.full_name || null,
      phone: phone,
      feedback_name: name,
      message: message || null,
      status: 1, // 1 - Chưa xử lý
    });

    sendCreateResponse(
      res,
      transformToCamelCase(newFeedback),
      "Feedback sent successfully and saved to database"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Phản hồi feedback - Chỉ admin mới có quyền
router.patch(
  "/:id/reply",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reply } = req.body;

      if (!id || isNaN(id)) {
        return sendErrorResponse(
          res,
          "Invalid feedback ID",
          "VALIDATION_ERROR",
          400
        );
      }

      if (!reply) {
        return sendErrorResponse(
          res,
          "Reply content is required",
          "VALIDATION_ERROR",
          400
        );
      }

      const feedback = await Feedback.findByPk(id);
      if (!feedback) {
        return sendNotFoundResponse(res, "Feedback not found");
      }

      // Gửi email phản hồi
      await sendReplyEmail(feedback.email, reply);

      // Cập nhật database
      feedback.status = 2; // Đã xử lý
      feedback.reply = reply;
      await feedback.save();

      sendUpdateResponse(
        res,
        transformToCamelCase(feedback),
        "Reply sent successfully"
      );
    } catch (error) {
      sendErrorResponse(res, error.message, "REPLY_ERROR", 400);
    }
  }
);

// Cập nhật thông tin feedback - Chỉ admin mới có quyền
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { phone, feedbackName, message, status, reply } = req.body;

    if (!id || isNaN(id)) {
      return sendErrorResponse(
        res,
        "Invalid feedback ID",
        "VALIDATION_ERROR",
        400
      );
    }

    const feedback = await Feedback.findByPk(id);
    if (!feedback) {
      return sendNotFoundResponse(res, "Feedback not found");
    }

    // Cập nhật các trường được cung cấp
    if (phone !== undefined) feedback.phone = phone;
    if (feedbackName !== undefined) feedback.feedback_name = feedbackName;
    if (message !== undefined) feedback.message = message;
    if (status !== undefined) feedback.status = parseInt(status);
    if (reply !== undefined) feedback.reply = reply;

    await feedback.save();

    sendUpdateResponse(
      res,
      transformToCamelCase(feedback),
      "Feedback updated successfully"
    );
  } catch (error) {
    sendErrorResponse(res, error.message, "UPDATE_ERROR", 400);
  }
});

// Xóa feedback - Chỉ admin mới có quyền
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return sendErrorResponse(
        res,
        "Invalid feedback ID",
        "VALIDATION_ERROR",
        400
      );
    }

    const feedback = await Feedback.findByPk(id);
    if (!feedback) {
      return sendNotFoundResponse(res, "Feedback not found");
    }

    await feedback.destroy();

    sendDeleteResponse(res, "Feedback deleted successfully");
  } catch (error) {
    sendErrorResponse(res, error.message, "DELETE_ERROR", 400);
  }
});

module.exports = router;
