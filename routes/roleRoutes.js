const express = require("express");
const { Role, User } = require("../models");
const { authMiddleware } = require("../middleware/authMiddleware");
const {
  adminMiddleware,
  adminOrMarketerMiddleware,
} = require("../middleware/roleMiddleware");
const { getRolePermissions } = require("../utils/permissionUtils");
const router = express.Router();
const { Op } = require("sequelize");
const sequelize = require("../config/database");
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

// Utility function to ensure permissions is always an array
const ensurePermissionsArray = (permissions) => {
  if (!permissions) return [];

  try {
    let parsedPermissions;
    if (typeof permissions === "string") {
      parsedPermissions = JSON.parse(permissions);
    } else {
      parsedPermissions = permissions;
    }

    // Đảm bảo permissions luôn là array
    if (Array.isArray(parsedPermissions)) {
      return parsedPermissions;
    } else if (
      typeof parsedPermissions === "object" &&
      parsedPermissions !== null
    ) {
      // Nếu là object, chuyển thành array của keys
      return Object.keys(parsedPermissions);
    } else {
      return [];
    }
  } catch (error) {
    return [];
  }
};

// Utility function to process permissions for storage (convert array to object)
const processPermissionsForStorage = (permissions) => {
  if (!permissions) return {};

  if (Array.isArray(permissions)) {
    // Nếu là array, chuyển thành object với value true
    return permissions.reduce((acc, perm) => {
      acc[perm] = true;
      return acc;
    }, {});
  } else if (typeof permissions === "object" && permissions !== null) {
    return permissions;
  } else {
    return {};
  }
};

// Lấy danh sách tất cả roles
router.get("/", async (req, res) => {
  try {
    const roles = await Role.findAll({
      where: { is_active: true },
      order: [["id", "ASC"]],
    });

    // Đảm bảo permissions luôn là array trong response
    const rolesWithArrayPermissions = roles.map((role) => {
      const roleData = role.toJSON();
      roleData.permissions = ensurePermissionsArray(roleData.permissions);
      return roleData;
    });

    sendListResponse(
      res,
      transformToCamelCase(rolesWithArrayPermissions),
      calculatePagination(roles.length, 1, roles.length)
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy role theo ID
router.get("/:id", async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);

    if (!role) {
      return sendNotFoundResponse(res, "Role không tồn tại");
    }

    // Đảm bảo permissions luôn là array trong response
    const roleData = role.toJSON();
    roleData.permissions = ensurePermissionsArray(roleData.permissions);

    sendDetailResponse(res, transformToCamelCase(roleData));
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Tạo role mới
router.post(
  "/",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể tạo
    try {
      const { name, description, permissions } = req.body;

      // Kiểm tra role name đã tồn tại chưa
      const existingRole = await Role.findOne({ where: { name } });
      if (existingRole) {
        return sendErrorResponse(
          res,
          "Tên role đã tồn tại",
          "DUPLICATE_NAME",
          400
        );
      }

      const newRole = await Role.create({
        name,
        description,
        permissions: processPermissionsForStorage(permissions),
        is_active: true,
      });

      sendCreateResponse(
        res,
        transformToCamelCase(newRole),
        "Tạo role thành công"
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Cập nhật role - chỉ Admin hoặc Marketer (role > 1) mới có thể update
router.put(
  "/:id",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const { name, description, permissions, is_active } = req.body;
      const roleId = req.params.id;

      const role = await Role.findByPk(roleId);
      if (!role) {
        return sendNotFoundResponse(res, "Role không tồn tại");
      }

      // Kiểm tra nếu đổi tên thì tên mới có trùng không
      if (name && name !== role.name) {
        const existingRole = await Role.findOne({ where: { name } });
        if (existingRole) {
          return sendErrorResponse(
            res,
            "Tên role đã tồn tại",
            "DUPLICATE_NAME",
            400
          );
        }
      }

      // Cập nhật role
      await role.update({
        name: name || role.name,
        description: description !== undefined ? description : role.description,
        permissions:
          permissions !== undefined
            ? processPermissionsForStorage(permissions)
            : role.permissions,
        is_active: is_active !== undefined ? is_active : role.is_active,
      });

      sendUpdateResponse(
        res,
        transformToCamelCase(role),
        "Cập nhật role thành công"
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Xóa role (soft delete) - chỉ Admin hoặc Marketer (role > 1) mới có thể xóa
router.delete(
  "/:id",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const roleId = req.params.id;

      const role = await Role.findByPk(roleId);
      if (!role) {
        return sendNotFoundResponse(res, "Role không tồn tại");
      }

      // Kiểm tra xem có user nào đang sử dụng role này không
      const usersWithRole = await User.count({ where: { role_id: roleId } });

      if (usersWithRole > 0) {
        return sendErrorResponse(
          res,
          `Không thể xóa role này vì có ${usersWithRole} user đang sử dụng`,
          "ROLE_IN_USE",
          400
        );
      }

      // Soft delete bằng cách set is_active = false
      await role.update({ is_active: false });

      sendDeleteResponse(res, "Xóa role thành công");
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Khôi phục role đã xóa
router.patch(
  "/:id/restore",
  authMiddleware,
  adminOrMarketerMiddleware, // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể restore
  async (req, res) => {
    try {
      const roleId = req.params.id;

      const role = await Role.findByPk(roleId);
      if (!role) {
        return sendNotFoundResponse(res, "Role không tồn tại");
      }

      await role.update({ is_active: true });

      sendUpdateResponse(
        res,
        transformToCamelCase(role),
        "Khôi phục role thành công"
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Lấy danh sách roles đã xóa
router.get(
  "/deleted/list",
  authMiddleware,
  adminOrMarketerMiddleware, // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể xem
  async (req, res) => {
    try {
      const deletedRoles = await Role.findAll({
        where: { is_active: false },
        order: [["id", "ASC"]],
      });

      sendListResponse(res, transformToCamelCase(deletedRoles), {
        total: deletedRoles.length,
        page: 1,
        pageSize: deletedRoles.length,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
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
      const { page = 1, limit = 10, search = "", searchTerm = "" } = req.query;

      // Normalize search parameters
      const search_normalized = search || searchTerm;

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role) {
        return sendNotFoundResponse(res, "Role không tồn tại");
      }

      // Tạo điều kiện tìm kiếm
      const whereConditions = {};

      // Filter theo role
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      whereConditions[Op.and].push({
        [Op.or]: [
          { role_id: roleId },
          { role: roleId }, // Hỗ trợ cả role cũ
        ],
      });

      // Filter theo search
      if (search_normalized) {
        whereConditions[Op.and].push({
          [Op.or]: [
            { full_name: { [Op.like]: `%${search_normalized}%` } },
            { email: { [Op.like]: `%${search_normalized}%` } },
          ],
        });
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
        include: [
          {
            model: Role,
            as: "Role",
            attributes: ["id", "name", "description", "permissions"],
          },
        ],
        order: [["created_at", "DESC"]],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
      });

      // Thêm role_name và permissions cho mỗi user
      const usersWithRole = users.map((user) => {
        const userData = user.toJSON();

        // Parse permissions từ Role.permissions hoặc fallback về default
        let permissions = [];
        if (user.Role && user.Role.permissions) {
          permissions = ensurePermissionsArray(user.Role.permissions);
        } else {
          // Fallback to default role permissions
          permissions = getRolePermissions(user.role_id || user.role);
        }

        return {
          ...userData,
          role_name: user.Role?.name || user.getRoleName(),
          permissions: permissions,
        };
      });

      const pagination = calculatePagination(totalUsers, page, limit);
      const responseData = {
        users: usersWithRole,
        role: {
          id: role.id,
          name: role.name,
          description: role.description,
        },
      };
      sendListResponse(res, transformToCamelCase(responseData), pagination);
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Gán role cho user
router.post(
  "/:roleId/assign-user",
  authMiddleware,
  adminOrMarketerMiddleware, // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể assign role
  async (req, res) => {
    try {
      const roleId = req.params.roleId;
      const { userId } = req.body;

      if (!userId) {
        return sendErrorResponse(res, "Thiếu userId", "VALIDATION_ERROR", 400);
      }

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role || !role.is_active) {
        return sendNotFoundResponse(
          res,
          "Role không tồn tại hoặc đã bị vô hiệu hóa"
        );
      }

      // Kiểm tra user có tồn tại không
      const user = await User.findByPk(userId);
      if (!user) {
        return sendNotFoundResponse(res, "User không tồn tại");
      }

      // Cập nhật role cho user
      await user.update({
        role_id: roleId,
        // Cập nhật cả role cũ để tương thích ngược
        role: roleId,
      });

      const responseData = {
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
      };
      sendUpdateResponse(
        res,
        transformToCamelCase(responseData),
        `Đã gán role "${role.name}" cho user thành công`
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Gán role cho nhiều users cùng lúc
router.post(
  "/:roleId/assign-multiple-users",
  authMiddleware,
  adminOrMarketerMiddleware, // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể assign role
  async (req, res) => {
    try {
      const roleId = req.params.roleId;
      const { userIds } = req.body;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return sendErrorResponse(
          res,
          "Thiếu userIds hoặc không đúng định dạng",
          "VALIDATION_ERROR",
          400
        );
      }

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role || !role.is_active) {
        return sendNotFoundResponse(
          res,
          "Role không tồn tại hoặc đã bị vô hiệu hóa"
        );
      }

      // Kiểm tra tất cả users có tồn tại không
      const users = await User.findAll({
        where: { id: userIds },
      });

      if (users.length !== userIds.length) {
        const foundUserIds = users.map((u) => u.id);
        const notFoundIds = userIds.filter((id) => !foundUserIds.includes(id));
        return sendNotFoundResponse(
          res,
          `Không tìm thấy users với IDs: ${notFoundIds.join(", ")}`
        );
      }

      // Cập nhật role cho tất cả users
      const updatePromises = users.map((user) =>
        user.update({
          role_id: roleId,
          role: roleId, // Cập nhật cả role cũ
        })
      );

      await Promise.all(updatePromises);

      const responseData = {
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
      };
      sendUpdateResponse(
        res,
        transformToCamelCase(responseData),
        `Đã gán role "${role.name}" cho ${users.length} users thành công`
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Xóa role khỏi user (set về User role)
router.delete(
  "/:roleId/remove-user/:userId",
  authMiddleware,
  adminOrMarketerMiddleware, // ✅ Chỉ Admin hoặc Marketer (role > 1) mới có thể remove role
  async (req, res) => {
    try {
      const roleId = req.params.roleId;
      const userId = req.params.userId;

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role) {
        return sendNotFoundResponse(res, "Role không tồn tại");
      }

      // Kiểm tra user có tồn tại không
      const user = await User.findByPk(userId);
      if (!user) {
        return sendNotFoundResponse(res, "User không tồn tại");
      }

      // Kiểm tra user có đang sử dụng role này không
      if (user.role_id !== parseInt(roleId) && user.role !== parseInt(roleId)) {
        return sendErrorResponse(
          res,
          "User không sử dụng role này",
          "VALIDATION_ERROR",
          400
        );
      }

      // Set về User role (ID = 1)
      await user.update({
        role_id: 1,
        role: 1,
      });

      const responseData = {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          role_id: user.role_id,
          role_name: "User",
        },
      };
      sendUpdateResponse(
        res,
        transformToCamelCase(responseData),
        `Đã xóa role "${role.name}" khỏi user thành công`
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Thống kê users theo role (endpoint với role ID)
router.get(
  "/:roleId/stats",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const roleId = req.params.roleId;

      // Kiểm tra role có tồn tại không
      const role = await Role.findByPk(roleId);
      if (!role) {
        return sendNotFoundResponse(res, "Role không tồn tại");
      }

      // Đếm số users trong role này
      const userCount = await User.count({
        where: {
          [Op.or]: [{ role_id: roleId }, { role: roleId }],
        },
      });

      const responseData = {
        role_id: role.id,
        role_name: role.name,
        description: role.description,
        user_count: userCount,
      };
      sendDetailResponse(res, transformToCamelCase(responseData));
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

module.exports = router;
