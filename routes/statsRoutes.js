const express = require("express");
const { Role, User } = require("../models");
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  adminMiddleware,
  adminOrMarketerMiddleware,
} = require("../middleware/roleMiddleware");
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const router = express.Router();
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

// Thống kê users theo role
router.get(
  "/users-by-role",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const stats = await User.findAll({
        attributes: [
          "role_id",
          "role",
          [sequelize.fn("COUNT", sequelize.col("id")), "user_count"],
        ],
        group: ["role_id", "role"],
        raw: true,
      });

      // Lấy thông tin roles
      const roles = await Role.findAll({
        where: { is_active: true },
        attributes: ["id", "name", "description"],
      });

      // Kết hợp thông tin
      const roleStats = roles.map((role) => {
        const stat = stats.find(
          (s) => s.role_id === role.id || s.role === role.id
        );
        return {
          role_id: role.id,
          role_name: role.name,
          description: role.description,
          user_count: stat ? parseInt(stat.user_count) : 0,
        };
      });

      const statsData = {
        roleStats,
        total_roles: roleStats.length,
        total_users: roleStats.reduce((sum, stat) => sum + stat.user_count, 0),
      };
      sendDetailResponse(res, transformToCamelCase(statsData));
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Thống kê tổng quan
router.get(
  "/overview",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      // Tổng số users
      const totalUsers = await User.count();

      // Tổng số roles
      const totalRoles = await Role.count({ where: { is_active: true } });

      // Users theo role
      const roleStats = await User.findAll({
        attributes: [
          "role_id",
          "role",
          [sequelize.fn("COUNT", sequelize.col("id")), "user_count"],
        ],
        group: ["role_id", "role"],
        raw: true,
      });

      // Users theo trạng thái
      const statusStats = await User.findAll({
        attributes: [
          "account_status",
          [sequelize.fn("COUNT", sequelize.col("id")), "user_count"],
        ],
        group: ["account_status"],
        raw: true,
      });

      const overviewData = {
        total_users: totalUsers,
        total_roles: totalRoles,
        role_distribution: roleStats,
        status_distribution: statusStats,
      };
      sendDetailResponse(res, transformToCamelCase(overviewData));
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

module.exports = router;
