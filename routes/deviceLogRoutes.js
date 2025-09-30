const express = require("express");
const router = express.Router();
const DeviceLog = require("../models/DeviceLog");
const { Sequelize } = require("sequelize");
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
router.get("/:userId", async (req, res) => {
  try {
    const user_id = req.params.userId;

    // Lấy tất cả bản ghi DeviceLog của người dùng
    const devices = await DeviceLog.findAll({
      where: { user_id: user_id },
      order: [["created_at", "DESC"]],
    });

    if (devices.length === 0) {
      return sendNotFoundResponse(
        res,
        "Không tìm thấy thông tin thiết bị đăng nhập"
      );
    }

    // Lọc để chỉ lấy bản ghi mới nhất của mỗi địa chỉ IP
    const uniqueDevices = [];
    const ipSet = new Set();

    // Duyệt qua các bản ghi đã sắp xếp để lấy bản ghi mới nhất cho mỗi IP
    for (const device of devices) {
      if (!ipSet.has(device.ip_address)) {
        ipSet.add(device.ip_address);
        uniqueDevices.push(device);
      }
    }

    sendListResponse(
      res,
      transformToCamelCase(uniqueDevices),
      calculatePagination(uniqueDevices.length, 1, uniqueDevices.length)
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

module.exports = router;
