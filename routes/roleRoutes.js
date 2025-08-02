const express = require("express");
const { Role, User } = require("../models");
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  adminMiddleware,
  adminOrMarketerMiddleware,
} = require("../middleware/roleMiddleware");
const router = express.Router();
const { Op } = require("sequelize");
const sequelize = require("../config/database");

// Lấy danh sách tất cả roles
router.get("/", authMiddleware, adminOrMarketerMiddleware, async (req, res) => {
  try {
    const roles = await Role.findAll({
      where: { is_active: true },
      order: [["id", "ASC"]],
    });

    res.json({
      success: true,
      data: roles,
      total: roles.length,
    });
  } catch (error) {
    console.error("Error fetching roles:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Lấy role theo ID
router.get(
  "/:id",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const role = await Role.findByPk(req.params.id);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role không tồn tại",
        });
      }

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      console.error("Error fetching role:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Tạo role mới
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, permissions } = req.body;

    // Kiểm tra role name đã tồn tại chưa
    const existingRole = await Role.findOne({ where: { name } });
    if (existingRole) {
      return res.status(400).json({
        success: false,
        message: "Tên role đã tồn tại",
      });
    }

    const newRole = await Role.create({
      name,
      description,
      permissions: permissions || {},
      is_active: true,
    });

    res.status(201).json({
      success: true,
      message: "Tạo role thành công",
      data: newRole,
    });
  } catch (error) {
    console.error("Error creating role:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Cập nhật role
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description, permissions, is_active } = req.body;
    const roleId = req.params.id;

    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role không tồn tại",
      });
    }

    // Kiểm tra nếu đổi tên thì tên mới có trùng không
    if (name && name !== role.name) {
      const existingRole = await Role.findOne({ where: { name } });
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: "Tên role đã tồn tại",
        });
      }
    }

    // Cập nhật role
    await role.update({
      name: name || role.name,
      description: description !== undefined ? description : role.description,
      permissions: permissions || role.permissions,
      is_active: is_active !== undefined ? is_active : role.is_active,
    });

    res.json({
      success: true,
      message: "Cập nhật role thành công",
      data: role,
    });
  } catch (error) {
    console.error("Error updating role:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Xóa role (soft delete)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const roleId = req.params.id;

    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role không tồn tại",
      });
    }

    // Kiểm tra xem có user nào đang sử dụng role này không
    const usersWithRole = await User.count({ where: { role_id: roleId } });

    if (usersWithRole > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa role này vì có ${usersWithRole} user đang sử dụng`,
      });
    }

    // Soft delete bằng cách set is_active = false
    await role.update({ is_active: false });

    res.json({
      success: true,
      message: "Xóa role thành công",
    });
  } catch (error) {
    console.error("Error deleting role:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Khôi phục role đã xóa
router.patch(
  "/:id/restore",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const roleId = req.params.id;

      const role = await Role.findByPk(roleId);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role không tồn tại",
        });
      }

      await role.update({ is_active: true });

      res.json({
        success: true,
        message: "Khôi phục role thành công",
        data: role,
      });
    } catch (error) {
      console.error("Error restoring role:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Lấy danh sách roles đã xóa
router.get(
  "/deleted/list",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const deletedRoles = await Role.findAll({
        where: { is_active: false },
        order: [["id", "ASC"]],
      });

      res.json({
        success: true,
        data: deletedRoles,
        total: deletedRoles.length,
      });
    } catch (error) {
      console.error("Error fetching deleted roles:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ===== API QUẢN LÝ USER ROLE =====

// Lấy danh sách users theo role
router.get(
  "/:roleId/users",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const roleId = req.params.roleId;
      const { page = 1, limit = 10, search = "" } = req.query;

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role không tồn tại",
        });
      }

      // Tạo điều kiện tìm kiếm
      const whereConditions = {
        [Op.or]: [
          { role_id: roleId },
          { role: roleId }, // Hỗ trợ cả role cũ
        ],
      };

      if (search) {
        whereConditions[Op.or] = [
          { full_name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ];
      }

      // Đếm tổng số users
      const totalUsers = await User.count({ where: whereConditions });

      // Lấy danh sách users với phân trang
      const users = await User.findAll({
        where: whereConditions,
        attributes: [
          "id",
          "email",
          "full_name",
          "role",
          "role_id",
          "account_status",
          "created_at",
        ],
        order: [["created_at", "DESC"]],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
      });

      // Thêm role_name cho mỗi user
      const usersWithRole = users.map((user) => ({
        ...user.toJSON(),
        role_name: user.Role?.name || user.getRoleName(),
      }));

      res.json({
        success: true,
        data: usersWithRole,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalUsers,
          totalPages: Math.ceil(totalUsers / parseInt(limit)),
        },
        role: {
          id: role.id,
          name: role.name,
          description: role.description,
        },
      });
    } catch (error) {
      console.error("Error fetching users by role:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Gán role cho user
router.post(
  "/:roleId/assign-user",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const roleId = req.params.roleId;
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Thiếu userId",
        });
      }

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role || !role.is_active) {
        return res.status(404).json({
          success: false,
          message: "Role không tồn tại hoặc đã bị vô hiệu hóa",
        });
      }

      // Kiểm tra user có tồn tại không
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User không tồn tại",
        });
      }

      // Cập nhật role cho user
      await user.update({
        role_id: roleId,
        // Cập nhật cả role cũ để tương thích ngược
        role: roleId,
      });

      res.json({
        success: true,
        message: `Đã gán role "${role.name}" cho user thành công`,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            role_id: user.role_id,
            role_name: role.name,
          },
          role: {
            id: role.id,
            name: role.name,
            description: role.description,
          },
        },
      });
    } catch (error) {
      console.error("Error assigning role to user:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Gán role cho nhiều users cùng lúc
router.post(
  "/:roleId/assign-multiple-users",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const roleId = req.params.roleId;
      const { userIds } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Thiếu userIds hoặc không đúng định dạng",
        });
      }

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role || !role.is_active) {
        return res.status(404).json({
          success: false,
          message: "Role không tồn tại hoặc đã bị vô hiệu hóa",
        });
      }

      // Kiểm tra tất cả users có tồn tại không
      const users = await User.findAll({
        where: { id: userIds },
      });

      if (users.length !== userIds.length) {
        const foundUserIds = users.map((u) => u.id);
        const notFoundIds = userIds.filter((id) => !foundUserIds.includes(id));
        return res.status(404).json({
          success: false,
          message: `Không tìm thấy users với IDs: ${notFoundIds.join(", ")}`,
        });
      }

      // Cập nhật role cho tất cả users
      const updatePromises = users.map((user) =>
        user.update({
          role_id: roleId,
          role: roleId, // Cập nhật cả role cũ
        })
      );

      await Promise.all(updatePromises);

      res.json({
        success: true,
        message: `Đã gán role "${role.name}" cho ${users.length} users thành công`,
        data: {
          updatedUsers: users.map((user) => ({
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            role_id: user.role_id,
            role_name: role.name,
          })),
          role: {
            id: role.id,
            name: role.name,
            description: role.description,
          },
        },
      });
    } catch (error) {
      console.error("Error assigning role to multiple users:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Xóa role khỏi user (set về User role)
router.delete(
  "/:roleId/remove-user/:userId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const roleId = req.params.roleId;
      const userId = req.params.userId;

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: "Role không tồn tại",
        });
      }

      // Kiểm tra user có tồn tại không
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User không tồn tại",
        });
      }

      // Kiểm tra user có đang sử dụng role này không
      if (user.role_id !== parseInt(roleId) && user.role !== parseInt(roleId)) {
        return res.status(400).json({
          success: false,
          message: "User không sử dụng role này",
        });
      }

      // Set về User role (ID = 1)
      await user.update({
        role_id: 1,
        role: 1,
      });

      res.json({
        success: true,
        message: `Đã xóa role "${role.name}" khỏi user thành công`,
        data: {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            role_id: user.role_id,
            role_name: "User",
          },
        },
      });
    } catch (error) {
      console.error("Error removing role from user:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Thống kê users theo role
router.get(
  "/stats/users-by-role",
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
      console.error("Error getting user role stats:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;
