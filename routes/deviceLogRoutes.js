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

// Import transform utilities
const { transformToCamelCase } = require("../utils/transformUtils");

// Get all device logs (admin only) - MUST be before /:userId route
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    // Get query parameters for filtering
    const { userId, ipAddress, os, browser, device } = req.query;

    // Build where conditions
    const whereConditions = {};
    if (userId) whereConditions.user_id = userId;
    if (ipAddress)
      whereConditions.ip_address = {
        [require("sequelize").Op.like]: `%${ipAddress}%`,
      };
    if (os) whereConditions.os = { [require("sequelize").Op.like]: `%${os}%` };
    if (browser)
      whereConditions.browser = {
        [require("sequelize").Op.like]: `%${browser}%`,
      };
    if (device)
      whereConditions.device = {
        [require("sequelize").Op.like]: `%${device}%`,
      };

    // Get all device logs with filters
    const devices = await DeviceLog.findAll({
      where: whereConditions,
      order: [["created_at", "DESC"]],
      limit: pageSize,
      offset: offset,
    });

    // Get total count for pagination
    const totalCount = await DeviceLog.count({
      where: whereConditions,
    });

    const pagination = calculatePagination(totalCount, page, pageSize);
    sendListResponse(res, transformToCamelCase(devices), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Get device logs for current user (me) - MUST be before /:userId route
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user_id = req.user.id; // Get user ID from JWT token

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    // Get all device logs for the user
    const devices = await DeviceLog.findAll({
      where: { user_id: user_id },
      order: [["created_at", "DESC"]],
      limit: pageSize,
      offset: offset,
    });

    // Get total count for pagination
    const totalCount = await DeviceLog.count({
      where: { user_id: user_id },
    });

    if (devices.length === 0) {
      return sendNotFoundResponse(
        res,
        "Không tìm thấy thông tin thiết bị đăng nhập"
      );
    }

    // Filter to get only the latest record for each IP address
    const uniqueDevices = [];
    const ipSet = new Set();

    // Iterate through sorted records to get the latest record for each IP
    for (const device of devices) {
      if (!ipSet.has(device.ip_address)) {
        ipSet.add(device.ip_address);
        uniqueDevices.push(device);
      }
    }

    const pagination = calculatePagination(totalCount, page, pageSize);
    sendListResponse(res, transformToCamelCase(uniqueDevices), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Get device logs for specific user (admin only)
router.get("/:userId", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user_id = req.params.userId;

    // Get pagination parameters
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    // Get all device logs for the user
    const devices = await DeviceLog.findAll({
      where: { user_id: user_id },
      order: [["created_at", "DESC"]],
      limit: pageSize,
      offset: offset,
    });

    // Get total count for pagination
    const totalCount = await DeviceLog.count({
      where: { user_id: user_id },
    });

    if (devices.length === 0) {
      return sendNotFoundResponse(
        res,
        "Không tìm thấy thông tin thiết bị đăng nhập"
      );
    }

    // Filter to get only the latest record for each IP address
    const uniqueDevices = [];
    const ipSet = new Set();

    // Iterate through sorted records to get the latest record for each IP
    for (const device of devices) {
      if (!ipSet.has(device.ip_address)) {
        ipSet.add(device.ip_address);
        uniqueDevices.push(device);
      }
    }

    const pagination = calculatePagination(totalCount, page, pageSize);
    sendListResponse(res, transformToCamelCase(uniqueDevices), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

module.exports = router;
