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

      res.json({
        success: true,
        data: roleStats,
        total_roles: roleStats.length,
        total_users: roleStats.reduce((sum, stat) => sum + stat.user_count, 0),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
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

      res.json({
        success: true,
        data: {
          total_users: totalUsers,
          total_roles: totalRoles,
          role_distribution: roleStats,
          status_distribution: statusStats,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;
