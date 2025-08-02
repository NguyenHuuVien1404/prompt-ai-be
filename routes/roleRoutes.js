const express = require("express");
const { Role } = require("../models");
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  adminMiddleware,
  adminOrMarketerMiddleware,
} = require("../middleware/roleMiddleware");
const router = express.Router();

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
    const { User } = require("../models");
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

module.exports = router;
