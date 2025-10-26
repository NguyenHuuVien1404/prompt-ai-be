const express = require("express");
const jwt = require("jsonwebtoken");
const { User, Role } = require("../models");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { sendOtpEmail } = require("../utils/emailService");
const UserSub = require("../models/UserSub");
const Subscription = require("../models/Subscription");
const DeviceLog = require("../models/DeviceLog");
const userAgentParser = require("useragent");
const { Sequelize } = require("sequelize");
const sequelize = require("../config/database");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const csv = require("csv-parser");
const csvWriter = require("csv-writer");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const { adminOrMarketerMiddleware } = require("../middleware/roleMiddleware");
const { Op } = require("sequelize");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { getRolePermissions } = require("../utils/permissionUtils");
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
const { safeCreate } = require("../utils/fieldTransformUtils");

// Utility function to convert snake_case to camelCase
const toCamelCase = (str) => {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

// Utility function to convert camelCase to snake_case
const toSnakeCase = (str) => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

// Utility function to transform object fields from camelCase to snake_case
const transformToSnakeCase = (obj, seen = new WeakSet()) => {
  if (!obj || typeof obj !== "object") return obj;

  // Check for circular reference
  if (seen.has(obj)) return obj;
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => transformToSnakeCase(item, seen));
  }

  // Handle Date objects - return as is
  if (obj instanceof Date) {
    return obj;
  }

  // Handle Sequelize instances - convert to plain object first
  if (obj.toJSON && typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);

    // Handle Date objects
    if (value instanceof Date) {
      transformed[snakeKey] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      transformed[snakeKey] = transformToSnakeCase(value, seen);
    } else if (Array.isArray(value)) {
      transformed[snakeKey] = value.map((item) =>
        transformToSnakeCase(item, seen)
      );
    } else {
      transformed[snakeKey] = value;
    }
  }
  return transformed;
};

// Utility function to transform object fields from snake_case to camelCase
const transformToCamelCase = (obj, seen = new WeakSet()) => {
  if (!obj || typeof obj !== "object") return obj;

  // Check for circular reference
  if (seen.has(obj)) return obj;
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => transformToCamelCase(item, seen));
  }

  // Handle Date objects - return as ISO string
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Handle Sequelize instances - convert to plain object first
  if (obj.toJSON && typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);

    // Handle Date objects
    if (value instanceof Date) {
      transformed[camelKey] = value.toISOString();
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      transformed[camelKey] = transformToCamelCase(value, seen);
    } else if (Array.isArray(value)) {
      transformed[camelKey] = value.map((item) =>
        transformToCamelCase(item, seen)
      );
    } else {
      transformed[camelKey] = value;
    }
  }
  return transformed;
};

// ✅ Standardized user response builder - ensures consistency across all login APIs
const buildStandardUserResponse = (
  user,
  permissions,
  userSubs = [],
  accessToken = null
) => {
  // Sort userSubs by type (highest first)
  const sortedUserSubs = userSubs
    .map((us) => ({
      id: us.id,
      status: us.status,
      startDate: us.start_date,
      endDate: us.end_date,
      token: us.token,
      subscription: us.Subscription
        ? {
            id: us.Subscription.id,
            nameSub: us.Subscription.name_sub,
            type: us.Subscription.type,
            price: us.Subscription.price,
          }
        : null,
    }))
    .sort((a, b) => (b.subscription?.type || 0) - (a.subscription?.type || 0));

  // Get the highest priority userSub
  const userSubData = sortedUserSubs.length > 0 ? sortedUserSubs[0] : null;

  // Convert user to plain object
  const plainUser = user.toJSON ? user.toJSON() : user;

  return {
    id: plainUser.id,
    email: plainUser.email,
    fullName: plainUser.full_name,
    role: plainUser.role,
    roleId: plainUser.role_id || null,
    countPrompt: plainUser.count_promt,
    accountStatus: plainUser.account_status,
    isVerified: plainUser.is_verified,
    profileImage: plainUser.profile_image,
    googleId: plainUser.google_id || null,
    createdAt: plainUser.created_at,
    updatedAt: plainUser.updated_at,
    permissions: permissions || [],
    userSub: userSubData,
    accessToken: accessToken,
  };
};

// Cache for role mapping to avoid repeated database queries
let roleMappingCache = null;
let roleMappingCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Utility function to get role mapping from database
const getRoleMapping = async () => {
  const now = Date.now();

  // Return cached data if still valid
  if (roleMappingCache && now - roleMappingCacheTime < CACHE_DURATION) {
    return roleMappingCache;
  }

  try {
    const roles = await Role.findAll({
      where: { is_active: true },
      attributes: ["id", "name"],
      order: [["id", "ASC"]],
    });

    // Build mapping object
    const mapping = {};
    roles.forEach((role) => {
      // Add both lowercase and uppercase versions
      mapping[role.name.toLowerCase()] = role.id;
      mapping[role.name] = role.id;
    });

    // Cache the result
    roleMappingCache = mapping;
    roleMappingCacheTime = now;

    return mapping;
  } catch (error) {
    console.error("Error fetching role mapping:", error);
    // Fallback to hardcoded mapping if database fails
    return {
      user: 1,
      admin: 2,
      marketer: 3,
      User: 1,
      Admin: 2,
      Marketer: 3,
    };
  }
};

// Utility function to add role filter to whereConditions
const addRoleFilter = async (whereConditions, role) => {
  if (role !== undefined && role !== null) {
    let parsedRole;

    // Handle string role names
    if (typeof role === "string") {
      const roleMap = await getRoleMapping();
      parsedRole = roleMap[role] || parseInt(role);
    } else {
      parsedRole = parseInt(role);
    }

    // Chỉ thêm nếu là số hợp lệ
    if (!isNaN(parsedRole)) {
      // ✅ Hỗ trợ cả role cũ và role_id mới - sử dụng Op.and để kết hợp với các filter khác
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      whereConditions[Op.and].push({
        [Op.or]: [{ role_id: parsedRole }, { role: parsedRole }],
      });
    }
  }
};

// Cấu hình Multer để lưu file vào thư mục "uploads"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Lưu file vào thư mục "uploads"
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Tạo tên file duy nhất
  },
});
const crypto = require("crypto"); // Để tạo token ngẫu nhiên
// Chỉ cho phép upload file ảnh (JPG, PNG, GIF, JPEG)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg", // JPG, JPEG
    "image/png", // PNG
    "image/gif", // GIF
    "image/bmp", // BMP
    "image/webp", // WebP
    "image/tiff", // TIFF
    "image/svg+xml", // SVG
    "image/heic", // HEIC (High-Efficiency Image Container)
    "image/heif", // HEIF (High-Efficiency Image File Format)
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Chấp nhận file hợp lệ
  } else {
    cb(
      new Error(
        "Invalid file type. Only common image formats (JPG, PNG, GIF, BMP, WebP, TIFF, SVG, HEIC, HEIF) are allowed."
      ),
      false
    );
  }
};

// Multer middleware: Cho phép upload tối đa 2 ảnh (image và image_card)
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn file tối đa 50MB
});

// Multer middleware riêng cho CSV import
const csvFileFilter = (req, file, cb) => {
  const allowedTypes = [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
  ];

  if (
    allowedTypes.includes(file.mimetype) ||
    file.originalname.toLowerCase().endsWith(".csv")
  ) {
    cb(null, true); // Chấp nhận file CSV
  } else {
    cb(
      new Error("Invalid file type. Only CSV files are allowed for import."),
      false
    );
  }
};

const csvUpload = multer({
  storage: storage,
  fileFilter: csvFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // Giới hạn file CSV tối đa 10MB
});
router.use("/upload", express.static("uploads")); // Cho phép truy cập ảnh đã upload

// Lấy tất cả users (GET route for RESTful API)
router.get("/", async (req, res) => {
  try {
    // Lấy tham số từ query parameters - support both camelCase and snake_case
    let {
      page,
      pageIndex,
      pageSize = 10,
      search,
      searchTerm, // Support new format
      accountStatus,
      account_status,
      status, // Support new format
      isVerified,
      is_verified,
      role,
      dateRange,
      dateFrom, // Support new format
      dateTo, // Support new format
    } = req.query;

    // Normalize parameters - support both old and new formats
    const search_normalized = search || searchTerm;
    const account_status_normalized =
      accountStatus !== undefined
        ? accountStatus
        : account_status !== undefined
        ? account_status
        : status === "active"
        ? 1
        : status === "inactive"
        ? 0
        : status;
    const is_verified_normalized =
      isVerified !== undefined ? isVerified : is_verified;

    // Đảm bảo các tham số số nguyên không bị NaN
    const currentPage = parseInt(page || pageIndex) || 1;
    const limit = parseInt(pageSize) || 10;
    const offset = (currentPage - 1) * limit;

    // Xây dựng điều kiện tìm kiếm
    const whereConditions = {};

    // Tìm kiếm theo tên hoặc email
    if (search_normalized) {
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      whereConditions[Op.and].push({
        [Op.or]: [
          { full_name: { [Op.like]: `%${search_normalized}%` } },
          { email: { [Op.like]: `%${search_normalized}%` } },
        ],
      });
    }

    // Lọc theo trạng thái
    if (
      account_status_normalized !== undefined &&
      account_status_normalized !== null
    ) {
      const parsedStatus = parseInt(account_status_normalized);
      // Chỉ thêm nếu là số hợp lệ
      if (!isNaN(parsedStatus)) {
        whereConditions.account_status = parsedStatus;
      }
    }

    // Lọc theo tình trạng xác thực
    if (
      is_verified_normalized !== undefined &&
      is_verified_normalized !== null
    ) {
      if (typeof is_verified_normalized === "string") {
        whereConditions.is_verified = is_verified_normalized === "true";
      } else {
        whereConditions.is_verified = !!is_verified_normalized;
      }
    }

    // ✅ Lọc theo vai trò - sử dụng function chung
    await addRoleFilter(whereConditions, role);

    // Lọc theo dateRange nếu có (từ query parameters)
    // Hỗ trợ cả dateRange[from]/dateRange[to] và dateFrom/dateTo
    const dateFromValue =
      req.query.dateRange?.from ||
      req.query["dateRange[from]"] ||
      req.query.dateFrom ||
      dateFrom;
    const dateToValue =
      req.query.dateRange?.to ||
      req.query["dateRange[to]"] ||
      req.query.dateTo ||
      dateTo;

    if (dateFromValue || dateToValue) {
      whereConditions.created_at = {};
      if (dateFromValue) {
        // Nếu chỉ có ngày (YYYY-MM-DD), thêm thời gian 00:00:00
        const fromDate = new Date(dateFromValue);
        if (dateFromValue.length === 10) {
          // YYYY-MM-DD format
          fromDate.setHours(0, 0, 0, 0);
        }
        whereConditions.created_at[Op.gte] = fromDate;
      }
      if (dateToValue) {
        // Nếu chỉ có ngày (YYYY-MM-DD), thêm thời gian 23:59:59
        const toDate = new Date(dateToValue);
        if (dateToValue.length === 10) {
          // YYYY-MM-DD format
          toDate.setHours(23, 59, 59, 999);
        }
        whereConditions.created_at[Op.lte] = toDate;
      }
    }

    // Log để debug (có thể xóa sau khi test xong)
    // console.log('Query params:', req.query);
    // console.log('DateRange:', req.query.dateRange);
    // console.log('DateFrom:', dateFrom, 'DateTo:', dateTo);
    // console.log('Where conditions:', JSON.stringify(whereConditions, null, 2));

    const userSubInclude = {
      model: UserSub,
      where: {
        status: 1,
        ...(req.query.sub_id ? { sub_id: req.query.sub_id } : {}),
      },
      required: false,
      include: [
        {
          model: Subscription,
          attributes: ["id", "name_sub", "type", "price"],
        },
      ],
    };

    // Get total count without includes to avoid JOIN counting issues
    const totalCount = await User.count({ where: whereConditions });

    // Get actual data with includes
    const rows = await User.findAll({
      attributes: { exclude: ["password_hash"] },
      include: [
        userSubInclude,
        {
          model: require("../models").Role,
          attributes: ["id", "name", "description"],
          as: "Role",
        },
      ],
      where: whereConditions,
      offset,
      limit,
      order: [["created_at", "DESC"]],
    });

    // ✅ Transform the data to flatten the structure - hỗ trợ cả role cũ và role_id mới
    const transformedRows = rows.map((row) => {
      const plainRow = row.get({ plain: true });

      // ✅ Hỗ trợ cả role cũ và role_id mới
      let roleName = "Unknown";
      if (plainRow.Role) {
        roleName = plainRow.Role.name;
      } else {
        // Fallback cho role cũ
        const roleMap = {
          1: "User",
          2: "Admin",
          3: "Marketer",
        };
        roleName = roleMap[plainRow.role] || "Unknown";
      }

      // ✅ Prepare userSub data giống như API detail
      let userSubData = null;
      if (plainRow.UserSubs && plainRow.UserSubs.length > 0) {
        // Sort by subscription type (highest first)
        const sortedUserSubs = plainRow.UserSubs.sort((a, b) => {
          const typeA = a.Subscription?.type || 0;
          const typeB = b.Subscription?.type || 0;
          return typeB - typeA;
        });

        const highestUserSub = sortedUserSubs[0];
        userSubData = {
          id: highestUserSub.id,
          status: highestUserSub.status,
          startDate: highestUserSub.start_date,
          endDate: highestUserSub.end_date,
          token: highestUserSub.token,
          subscription: highestUserSub.Subscription
            ? {
                id: highestUserSub.Subscription.id,
                nameSub: highestUserSub.Subscription.name_sub,
                type: highestUserSub.Subscription.type,
                price: highestUserSub.Subscription.price,
              }
            : null,
        };
      }

      const transformedRow = {
        ...plainRow,
        userSub: userSubData,
        subId: plainRow.UserSubs?.[0]?.sub_id || null,
        UserSubs: undefined, // Remove the UserSubs array
        roleName: roleName,
        Role: undefined, // Remove the Role object
      };

      // Remove snake_case fields that have camelCase equivalents
      delete transformedRow.sub_id;
      delete transformedRow.role_name;

      return transformToCamelCase(transformedRow);
    });

    const pagination = calculatePagination(totalCount, currentPage, limit);
    sendListResponse(res, transformedRows, pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy tất cả users (POST route for backward compatibility)
router.post(
  "/list",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      // Lấy tham số từ request body thay vì query - support both camelCase and snake_case
      let {
        page,
        pageIndex,
        pageSize = 10,
        search,
        accountStatus,
        account_status,
        isVerified,
        is_verified,
        role,
      } = req.body;

      // Normalize to snake_case for database queries
      const account_status_normalized =
        accountStatus !== undefined ? accountStatus : account_status;
      const is_verified_normalized =
        isVerified !== undefined ? isVerified : is_verified;

      // Đảm bảo các tham số số nguyên không bị NaN
      const currentPage = parseInt(page || pageIndex) || 1;
      const limit = parseInt(pageSize) || 10;
      const offset = (currentPage - 1) * limit;

      // Xây dựng điều kiện tìm kiếm
      const whereConditions = {};

      // Tìm kiếm theo tên hoặc email
      if (search) {
        whereConditions[Op.or] = [
          { full_name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
        ];
      }

      // Lọc theo trạng thái
      if (
        account_status_normalized !== undefined &&
        account_status_normalized !== null
      ) {
        const parsedStatus = parseInt(account_status_normalized);
        // Chỉ thêm nếu là số hợp lệ
        if (!isNaN(parsedStatus)) {
          whereConditions.account_status = parsedStatus;
        }
      }

      // Lọc theo tình trạng xác thực
      if (
        is_verified_normalized !== undefined &&
        is_verified_normalized !== null
      ) {
        if (typeof is_verified_normalized === "string") {
          whereConditions.is_verified = is_verified_normalized === "true";
        } else {
          whereConditions.is_verified = !!is_verified_normalized;
        }
      }

      // ✅ Lọc theo vai trò - sử dụng function chung
      await addRoleFilter(whereConditions, role);

      // Log để debug

      const userSubInclude = {
        model: UserSub,
        where: {
          status: 1,
          ...(req.body.sub_id ? { sub_id: req.body.sub_id } : {}),
        },
        required: false,
        include: [
          {
            model: Subscription,
            attributes: ["id", "name_sub", "type", "price"],
          },
        ],
      };

      // Get total count without includes to avoid JOIN counting issues
      const totalCount = await User.count({ where: whereConditions });

      // Get actual data with includes
      const rows = await User.findAll({
        attributes: { exclude: ["password_hash"] },
        include: [
          userSubInclude,
          {
            model: require("../models").Role,
            attributes: ["id", "name", "description"],
            as: "Role",
          },
        ],
        where: whereConditions,
        offset,
        limit,
        order: [["created_at", "DESC"]],
      });

      // ✅ Transform the data to flatten the structure - hỗ trợ cả role cũ và role_id mới
      const transformedRows = rows.map((row) => {
        const plainRow = row.get({ plain: true });

        // ✅ Hỗ trợ cả role cũ và role_id mới
        let roleName = "Unknown";
        if (plainRow.Role) {
          roleName = plainRow.Role.name;
        } else {
          // Fallback cho role cũ
          const roleMap = {
            1: "User",
            2: "Admin",
            3: "Marketer",
          };
          roleName = roleMap[plainRow.role] || "Unknown";
        }

        // ✅ Prepare userSub data giống như API detail
        let userSubData = null;
        if (plainRow.UserSubs && plainRow.UserSubs.length > 0) {
          // Sort by subscription type (highest first)
          const sortedUserSubs = plainRow.UserSubs.sort((a, b) => {
            const typeA = a.Subscription?.type || 0;
            const typeB = b.Subscription?.type || 0;
            return typeB - typeA;
          });

          const highestUserSub = sortedUserSubs[0];
          userSubData = {
            id: highestUserSub.id,
            status: highestUserSub.status,
            startDate: highestUserSub.start_date,
            endDate: highestUserSub.end_date,
            token: highestUserSub.token,
            subscription: highestUserSub.Subscription
              ? {
                  id: highestUserSub.Subscription.id,
                  nameSub: highestUserSub.Subscription.name_sub,
                  type: highestUserSub.Subscription.type,
                  price: highestUserSub.Subscription.price,
                }
              : null,
          };
        }

        const transformedRow = {
          ...plainRow,
          userSub: userSubData,
          subId: plainRow.UserSubs?.[0]?.sub_id || null,
          UserSubs: undefined, // Remove the UserSubs array
          roleName: roleName,
          Role: undefined, // Remove the Role object
        };

        // Remove snake_case fields that have camelCase equivalents
        delete transformedRow.sub_id;
        delete transformedRow.role_name;

        return transformToCamelCase(transformedRow);
      });

      const pagination = calculatePagination(totalCount, currentPage, limit);
      sendListResponse(res, transformedRows, pagination);
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Tạo user mới
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await safeCreate(User, req.body);
    sendCreateResponse(
      res,
      transformToCamelCase(user),
      "User created successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Get current user (me) - requires authentication
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id; // Get user ID from JWT token
    const user = await User.findByPk(userId, {
      include: [
        {
          model: Role,
          attributes: ["id", "name", "description", "permissions"],
        },
      ],
    });

    if (!user) return sendNotFoundResponse(res, "User not found");

    const userSubs = await user.getUserSubs({
      where: { status: 1 }, // ✅ Chỉ lấy active subscriptions để nhất quán với List API
      include: [Subscription],
      order: [["id", "DESC"]], // ✅ Sắp xếp theo ID giảm dần (mới nhất trước)
    });

    const sortedUserSubs = userSubs; // ✅ Không cần sort thêm vì đã order trong query

    // ✅ Lấy permissions từ role
    let permissions = [];
    if (user.Role && user.Role.permissions) {
      try {
        // Kiểm tra nếu permissions đã là array thì dùng trực tiếp, nếu là string thì parse
        const parsedPermissions =
          typeof user.Role.permissions === "string"
            ? JSON.parse(user.Role.permissions)
            : user.Role.permissions;

        // Nếu là array và có items thì dùng
        if (Array.isArray(parsedPermissions) && parsedPermissions.length > 0) {
          permissions = parsedPermissions;
        }
        // Nếu là object rỗng {} hoặc array rỗng [] thì fallback
        else if (
          Object.keys(parsedPermissions).length === 0 ||
          (Array.isArray(parsedPermissions) && parsedPermissions.length === 0)
        ) {
          permissions = getRolePermissions(user.role_id || user.role);
        } else {
          permissions = parsedPermissions;
        }
      } catch (error) {
        permissions = getRolePermissions(user.role_id || user.role);
      }
    } else {
      // ✅ Fallback to default role permissions using utility function
      permissions = getRolePermissions(user.role_id || user.role);
    }

    // Prepare userSub data
    const userSubData =
      sortedUserSubs.length > 0
        ? {
            id: sortedUserSubs[0].id,
            status: sortedUserSubs[0].status,
            startDate: sortedUserSubs[0].start_date,
            endDate: sortedUserSubs[0].end_date,
            token: sortedUserSubs[0].token,
            subscription: sortedUserSubs[0].Subscription
              ? {
                  id: sortedUserSubs[0].Subscription.id,
                  nameSub: sortedUserSubs[0].Subscription.name_sub,
                  type: sortedUserSubs[0].Subscription.type,
                  price: sortedUserSubs[0].Subscription.price,
                }
              : null,
          }
        : null;

    // Convert user to plain object and manually construct response
    const plainUser = user.toJSON();

    const userData = {
      id: plainUser.id,
      email: plainUser.email,
      fullName: plainUser.full_name,
      role: plainUser.role,
      roleId: plainUser.role_id,
      countPrompt: plainUser.count_promt,
      accountStatus: plainUser.account_status,
      isVerified: plainUser.is_verified,
      profileImage: plainUser.profile_image,
      googleId: plainUser.google_id,
      createdAt: plainUser.created_at,
      updatedAt: plainUser.updated_at,
      permissions: permissions,
      userSub: userSubData,
    };

    sendDetailResponse(res, userData);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy user theo ID
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      include: [
        {
          model: Role,
          attributes: ["id", "name", "description", "permissions"],
        },
      ],
    });

    if (!user) return sendNotFoundResponse(res, "User not found");

    const userSubs = await user.getUserSubs({
      where: { status: 1 }, // ✅ Chỉ lấy active subscriptions để nhất quán với List API
      include: [Subscription],
      order: [["id", "DESC"]], // ✅ Sắp xếp theo ID giảm dần (mới nhất trước)
    });

    const sortedUserSubs = userSubs; // ✅ Không cần sort thêm vì đã order trong query

    // ✅ Lấy permissions từ role
    let permissions = [];
    if (user.Role && user.Role.permissions) {
      try {
        // Kiểm tra nếu permissions đã là array thì dùng trực tiếp, nếu là string thì parse
        const parsedPermissions =
          typeof user.Role.permissions === "string"
            ? JSON.parse(user.Role.permissions)
            : user.Role.permissions;

        // Nếu là array và có items thì dùng
        if (Array.isArray(parsedPermissions) && parsedPermissions.length > 0) {
          permissions = parsedPermissions;
        }
        // Nếu là object rỗng {} hoặc array rỗng [] thì fallback
        else if (
          Object.keys(parsedPermissions).length === 0 ||
          (Array.isArray(parsedPermissions) && parsedPermissions.length === 0)
        ) {
          permissions = getRolePermissions(user.role_id || user.role);
        } else {
          permissions = parsedPermissions;
        }
      } catch (error) {
        permissions = getRolePermissions(user.role_id || user.role);
      }
    } else {
      // ✅ Fallback to default role permissions using utility function
      permissions = getRolePermissions(user.role_id || user.role);
    }

    // Prepare userSub data
    const userSubData =
      sortedUserSubs.length > 0
        ? {
            id: sortedUserSubs[0].id,
            status: sortedUserSubs[0].status,
            startDate: sortedUserSubs[0].start_date,
            endDate: sortedUserSubs[0].end_date,
            token: sortedUserSubs[0].token,
            subscription: sortedUserSubs[0].Subscription
              ? {
                  id: sortedUserSubs[0].Subscription.id,
                  nameSub: sortedUserSubs[0].Subscription.name_sub,
                  type: sortedUserSubs[0].Subscription.type,
                  price: sortedUserSubs[0].Subscription.price,
                }
              : null,
          }
        : null;

    // Convert user to plain object and manually construct response
    const plainUser = user.toJSON();

    const userData = {
      id: plainUser.id,
      email: plainUser.email,
      fullName: plainUser.full_name,
      role: plainUser.role,
      roleId: plainUser.role_id,
      countPrompt: plainUser.count_promt,
      accountStatus: plainUser.account_status,
      isVerified: plainUser.is_verified,
      profileImage: plainUser.profile_image,
      googleId: plainUser.google_id,
      createdAt: plainUser.created_at,
      updatedAt: plainUser.updated_at,
      permissions: permissions,
      userSub: userSubData,
    };

    sendDetailResponse(res, userData);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Cập nhật user
router.put("/:id", async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const user = await User.findByPk(req.params.id, { transaction });
    if (!user) {
      await transaction.rollback();
      return sendNotFoundResponse(res, "User not found");
    }

    // Extract userSub data from request body BEFORE transformation
    const { userSub, ...userData } = req.body;

    // Transform userData to snake_case for database operations
    const transformedUserData = transformToSnakeCase(userData);

    // Update user information (exclude userSub data)
    // Force update with individual field - try Object.entries approach
    let countPromptValue = undefined;
    for (const [key, value] of Object.entries(transformedUserData)) {
      if (key === "count_prompt") {
        countPromptValue = value;
        break;
      }
    }

    if (countPromptValue !== undefined) {
      user.count_promt = countPromptValue;
      await user.save({ transaction });
    } else {
      await user.update(transformedUserData, { transaction });
    }

    // Update subscription if userSub data is provided
    if (userSub) {
      const { subscriptionId, startDate, endDate, token, status } = userSub;

      // Find ANY user subscription (not just active ones)
      const existingUserSub = await UserSub.findOne({
        where: { user_id: req.params.id },
        order: [["id", "DESC"]], // Get the most recent one by ID
        transaction,
      });

      if (existingUserSub) {
        // Update existing subscription
        const updateData = {
          sub_id: subscriptionId || existingUserSub.sub_id,
          start_date: startDate || existingUserSub.start_date,
          end_date: endDate || existingUserSub.end_date,
          token: token !== undefined ? token : existingUserSub.token,
          status: status !== undefined ? status : existingUserSub.status,
        };

        await existingUserSub.update(updateData, { transaction });
      } else if (subscriptionId) {
        // Vô hiệu hóa tất cả subscription cũ trước khi tạo mới
        await UserSub.update(
          { status: 0 }, // 0 = inactive
          {
            where: { user_id: req.params.id, status: 1 },
            transaction,
          }
        );

        // Create new subscription if none exists
        const createData = {
          user_id: req.params.id,
          sub_id: subscriptionId,
          status: status || 1,
          start_date: startDate || new Date(),
          end_date: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          token: token || 0,
        };

        await UserSub.create(createData, { transaction });
      } else {
      }
    }

    // Handle legacy subId or sub_id for backward compatibility
    const subId = req.body.subId || req.body.sub_id;
    if (subId && !userSub) {
      // Vô hiệu hóa tất cả subscription cũ trước khi cập nhật
      await UserSub.update(
        { status: 0 }, // 0 = inactive
        {
          where: { user_id: req.params.id, status: 1 },
          transaction,
        }
      );

      const legacyUserSub = await UserSub.findOne({
        where: { user_id: req.params.id, status: 0 }, // Tìm subscription đã inactive
        order: [["id", "DESC"]], // Lấy subscription mới nhất
        transaction,
      });

      if (legacyUserSub) {
        await legacyUserSub.update(
          {
            sub_id: subId,
            status: 1, // Kích hoạt lại
          },
          { transaction }
        );
      } else {
        // Create new subscription if none exists
        await UserSub.create(
          {
            user_id: req.params.id,
            sub_id: subId,
            status: 1,
            start_date: new Date(),
            end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          },
          { transaction }
        );
      }
    }

    // Commit transaction
    await transaction.commit();

    // Get updated user with subscription
    const updatedUser = await User.findByPk(req.params.id, {
      include: [
        {
          model: UserSub,
          where: { status: 1 },
          include: [Subscription],
        },
      ],
    });

    sendUpdateResponse(
      res,
      transformToCamelCase(updatedUser),
      "User updated successfully"
    );
  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();
    console.error(`Error updating user ${req.params.id}:`, error);
    sendInternalErrorResponse(res, error.message);
  }
});

// Xóa user
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return sendNotFoundResponse(res, "User not found");

    await user.destroy();
    sendDeleteResponse(res, "User deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Đăng ký tài khoản
router.post("/register", async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return sendErrorResponse(
        res,
        "Email đã được sử dụng. Vui lòng chọn email khác.",
        "DUPLICATE_EMAIL",
        400
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();

    const newUser = await User.create({
      full_name,
      email,
      password_hash: hashedPassword,
      otp_code: otp,
      otp_expires_at: new Date(Date.now() + 10 * 60 * 1000), // OTP hết hạn sau 10 phút
      account_status: 1,
      role: 1,
      count_promt: 15,
    });

    // Lấy ID của subscription miễn phí
    const freeSub = await Subscription.findOne({
      where: { type: 4 },
      attributes: ["id"],
    });
    if (!freeSub) {
      return sendNotFoundResponse(res, "Không có subscription miễn phí");
    }

    // Tạo bản ghi mới trong bảng UserSub
    const newUserSub = await UserSub.create({
      user_id: newUser.id,
      sub_id: freeSub.id,
      status: 1,
      start_date: new Date(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await sendOtpEmail(email, otp);
    sendDetailResponse(
      res,
      { userId: newUser.id },
      "Mã OTP đã được gửi đến email. Vui lòng xác thực tài khoản."
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Gửi lại mã OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendErrorResponse(
        res,
        "Vui lòng cung cấp địa chỉ email",
        "VALIDATION_ERROR",
        400
      );
    }

    // Tìm user theo email
    const user = await User.findOne({ where: { email } });

    // Kiểm tra người dùng tồn tại
    if (!user) {
      return sendNotFoundResponse(
        res,
        "Không tìm thấy tài khoản với email này"
      );
    }

    // Kiểm tra nếu tài khoản đã được xác thực
    // if (user.is_verified) {
    //     return res.status(400).json({ error: 'Tài khoản này đã được xác thực. Vui lòng đăng nhập.' });
    // }

    // Tạo mã OTP mới
    const otp = generateOtp();

    // Cập nhật OTP và thời gian hết hạn trong database
    user.otp_code = otp;
    user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 phút
    await user.save();

    // Gửi email chứa OTP
    await sendOtpEmail(email, otp);

    // Trả về thông báo thành công
    sendDetailResponse(
      res,
      { userId: user.id },
      "Mã OTP đã được gửi lại đến email. Vui lòng xác thực tài khoản."
    );
  } catch (error) {
    sendInternalErrorResponse(res, "Đã xảy ra lỗi khi gửi lại mã OTP");
  }
});
// Xác thực OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({
      where: { email },
      include: [
        {
          model: Role,
          attributes: ["id", "name", "permissions"],
        },
        {
          model: UserSub,
          include: [
            {
              model: Subscription,
              attributes: ["id", "name_sub", "type", "price"],
            },
          ],
          order: [["created_at", "DESC"]],
        },
      ],
    });

    if (
      !user ||
      user.otp_code !== otp ||
      new Date() > new Date(user.otp_expires_at)
    ) {
      return res
        .status(400)
        .json({ error: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }

    // Cập nhật trạng thái xác thực
    user.is_verified = true;
    user.otp_code = null;
    user.otp_expires_at = null;
    await user.save();

    // Lấy permissions từ role
    let permissions = [];
    if (user.Role && user.Role.permissions) {
      try {
        const parsedPermissions =
          typeof user.Role.permissions === "string"
            ? JSON.parse(user.Role.permissions)
            : user.Role.permissions;

        // Nếu là array và có items thì dùng
        if (Array.isArray(parsedPermissions) && parsedPermissions.length > 0) {
          permissions = parsedPermissions;
        }
        // Nếu là object rỗng {} hoặc array rỗng [] thì fallback
        else if (
          Object.keys(parsedPermissions).length === 0 ||
          (Array.isArray(parsedPermissions) && parsedPermissions.length === 0)
        ) {
          permissions = getRolePermissions(user.role_id || user.role);
        } else {
          permissions = parsedPermissions;
        }
      } catch (error) {
        permissions = getRolePermissions(user.role_id || user.role);
      }
    } else {
      permissions = getRolePermissions(user.role_id || user.role);
    }

    // Tạo JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        role_id: user.role_id,
        role_name: user.Role?.name || "User",
        permissions: permissions,
      },
      process.env.JWT_SECRET || "your_jwt_secret_key",
      { expiresIn: 60 * 60 * 24 * 30 * 6 }
    );

    // ✅ Use standardized user response builder
    const userData = {
      token,
      user: buildStandardUserResponse(
        user,
        permissions,
        user.UserSubs || [],
        token
      ),
    };

    sendDetailResponse(res, userData, "Tài khoản đã được xác thực thành công");
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Đăng nhập
router.post("/login", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      const newUser = await User.create({
        full_name: email,
        email,

        account_status: 1,
        role: 1,
        count_promt: 15,
      });

      // Lấy ID của subscription miễn phí
      const freeSub = await Subscription.findOne({
        where: { type: 1 },
        attributes: ["id"],
      });
      if (!freeSub) {
        return res
          .status(404)
          .json({ error: "Không có subscription miễn phí" });
      }

      // Tạo bản ghi mới trong bảng UserSub
      const newUserSub = await UserSub.create({
        user_id: newUser.id,
        sub_id: freeSub.id,
        status: 1,
        start_date: new Date(),
        end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
    }

    // Kiểm tra mật khẩu
    // const isValidPassword = await bcrypt.compare(password, user.password_hash);
    // if (!isValidPassword) {
    //     return res.status(400).json({ error: "Mật khẩu không đúng" });
    // }

    // Kiểm tra xác thực
    // if (user.is_verified) {
    // Tạo token và đăng nhập thành công
    // const token = jwt.sign(
    //     { id: user.id, email: user.email, role: user.role },
    //     process.env.JWT_SECRET,
    //     { expiresIn: '24h' }
    // );

    // return res.json({
    //     message: "Đăng nhập thành công",
    //     token,
    //     user: {
    //         id: user.id,
    //         email: user.email,
    //         full_name: user.full_name,
    //         role: user.role
    //     }
    // });
    //     const otp = generateOtp();
    //     user.otp_code = otp;
    //     user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
    //     await user.save();

    //     await sendOtpEmail(email, otp);

    //     // Trả về mã trạng thái 202 Accepted với flag requireVerification
    //     return res.status(200).json({
    //         message: "Mã OTP đã được gửi đến email của bạn.",
    //         // requireVerification: true,
    //         email: user.email
    //     });
    // } else {
    // Tài khoản chưa xác thực - tạo OTP mới và gửi
    const otp = generateOtp();
    user.otp_code = otp;
    user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendOtpEmail(email, otp);

    // Trả về mã trạng thái 202 Accepted với flag requireVerification
    return res.status(202).json({
      message:
        "Tài khoản chưa được xác thực. Mã OTP đã được gửi đến email của bạn.",
      requireVerification: true,
      email: user.email,
    });
    //}
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// 🟢 Xác thực OTP để đăng nhập
router.post("/login-verify", async (req, res) => {
  try {
    const { email, otp, ip_address } = req.body;
    const user = await User.findOne({
      where: { email },
      include: { model: UserSub },
      nest: true,
    });
    if (
      !user ||
      user.otp_code !== otp ||
      new Date() > new Date(user.otp_expires_at)
    ) {
      return res
        .status(400)
        .json({ error: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }

    // 🟢 Xóa OTP sau khi đăng nhập
    user.otp_code = null;
    //cập nhật đã xác thực
    user.is_verified = 1;
    await user.save();

    const userSubs = await user.getUserSubs({
      where: { status: 1 },
      include: [Subscription],
    });

    // Lấy thông tin thiết bị từ yêu cầu
    const userAgent = req.headers["user-agent"];
    const ipAddress = ip_address || req.connection.remoteAddress;
    const agent = userAgentParser.parse(userAgent); // Phân tích User-Agent để lấy thông tin thiết bị

    // Kiểm tra xem thiết bị đã đăng nhập trước đó chưa (cùng user_id và ip_address)
    const existingDevice = await DeviceLog.findOne({
      where: { user_id: user.id, ip_address: ipAddress },
    });
    if (existingDevice) {
      await DeviceLog.update(
        {
          updated_at: Sequelize.literal("CURRENT_TIMESTAMP"),
          login_time: new Date(),
        },
        { where: { id: existingDevice.id } }
      );
    } else {
      // Tạo bản ghi mới nếu thiết bị chưa đăng nhập
      await DeviceLog.create({
        user_id: user.id,
        ip_address: ipAddress,
        os: agent.os.toString(),
        browser: agent.toAgent(),
        device: agent.device.toString(),
        login_time: new Date(),
        latitude: req.body.latitude || null, // Nếu có gửi latitude từ frontend
        longitude: req.body.longitude || null, // Nếu có gửi longitude từ frontend
      });
    }

    // ✅ Lấy permissions từ role
    let permissions = [];
    if (user.Role && user.Role.permissions) {
      try {
        // Kiểm tra nếu permissions đã là array thì dùng trực tiếp, nếu là string thì parse
        permissions =
          typeof user.Role.permissions === "string"
            ? JSON.parse(user.Role.permissions)
            : user.Role.permissions;
      } catch (error) {
        permissions = [];
      }
    } else {
      // ✅ Fallback to default role permissions using utility function
      // Ưu tiên role_id trước, nếu không có thì dùng role cũ
      permissions = getRolePermissions(user.role_id || user.role);
    }

    // ✅ Tạo JWT token - hỗ trợ cả role cũ và role_id mới
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role, // ✅ Giữ nguyên cho backward compatible
        role_id: user.role_id, // ✅ Thêm mới cho role system
        role_name: user.Role?.name || user.getRoleName?.() || "User", // ✅ Thêm role name
        permissions: permissions, // ✅ Thêm permissions vào token
      },
      process.env.JWT_SECRET || "your_jwt_secret_key",
      { expiresIn: 60 * 60 * 24 * 30 * 6 }
    );

    // ✅ Use standardized user response builder
    const userData = {
      token,
      user: buildStandardUserResponse(user, permissions, userSubs, token),
    };
    sendDetailResponse(
      res,
      transformToCamelCase(userData),
      "Đăng nhập thành công"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Đăng nhập bằng mật khẩu
router.post("/login-password", async (req, res) => {
  try {
    const { email, password, ip_address } = req.body;
    const user = await User.findOne({
      where: { email },
      include: { model: UserSub },
      nest: true,
    });
    if (!user) {
      return res
        .status(400)
        .json({ error: "Email không tồn tại, hãy tiến hành đăng ký" });
    }
    if (user.is_verified) {
      // Kiểm tra mật khẩu
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(400).json({ error: "Mật khẩu không đúng" });
      }

      // Lấy thông tin user subscriptions
      const userSubs = await user.getUserSubs({
        where: { status: 1 },
        include: [Subscription],
      });

      // Ghi log thiết bị
      const userAgent = req.headers["user-agent"];
      const ipAddress = ip_address || req.connection.remoteAddress;
      const agent = userAgentParser.parse(userAgent);

      const existingDevice = await DeviceLog.findOne({
        where: { user_id: user.id, ip_address: ipAddress },
      });
      if (existingDevice) {
        await DeviceLog.update(
          {
            updated_at: Sequelize.literal("CURRENT_TIMESTAMP"),
            login_time: new Date(),
          },
          { where: { id: existingDevice.id } }
        );
      } else {
        await DeviceLog.create({
          user_id: user.id,
          ip_address: ipAddress,
          os: agent.os.toString(),
          browser: agent.toAgent(),
          device: agent.device.toString(),
          login_time: new Date(),
          latitude: req.body.latitude || null,
          longitude: req.body.longitude || null,
        });
      }

      // ✅ Lấy permissions từ role
      let permissions = [];
      if (user.Role && user.Role.permissions) {
        try {
          // Kiểm tra nếu permissions đã là array thì dùng trực tiếp, nếu là string thì parse
          permissions =
            typeof user.Role.permissions === "string"
              ? JSON.parse(user.Role.permissions)
              : user.Role.permissions;
        } catch (error) {
          permissions = [];
        }
      } else {
        // ✅ Fallback to default role permissions using utility function
        // Ưu tiên role_id trước, nếu không có thì dùng role cũ
        permissions = getRolePermissions(user.role_id || user.role);
      }

      // ✅ Tạo JWT token - hỗ trợ cả role cũ và role_id mới
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role, // ✅ Giữ nguyên cho backward compatible
          role_id: user.role_id, // ✅ Thêm mới cho role system
          role_name: user.Role?.name || user.getRoleName?.() || "User", // ✅ Thêm role name
          permissions: permissions, // ✅ Thêm permissions vào token
        },
        process.env.JWT_SECRET || "your_jwt_secret_key",
        { expiresIn: 60 * 60 * 24 * 30 * 6 }
      );

      // ✅ Use standardized user response builder
      const userData = {
        token,
        user: buildStandardUserResponse(user, permissions, userSubs, token),
      };
      sendDetailResponse(
        res,
        transformToCamelCase(userData),
        "Đăng nhập thành công"
      );
    } else {
      // Tài khoản chưa xác thực - tạo OTP mới và gửi
      const otp = generateOtp();
      user.otp_code = otp;
      user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      await sendOtpEmail(email, otp);

      // Trả về mã trạng thái 202 Accepted với flag requireVerification
      return res.status(202).json({
        message:
          "Tài khoản chưa được xác thực. Mã OTP đã được gửi đến email của bạn.",
        requireVerification: true,
        email: user.email,
      });
    }
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Cập nhật count_promt giảm 1 cho user theo id
router.put("/count-prompt/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    // Tìm người dùng theo id
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Kiểm tra nếu count_promt đã đạt 0, không giảm nữa
    if (user.count_promt <= 0) {
      return res
        .status(200)
        .json({ message: "count_promt is min", count_prompt: 0 });
    }

    // Giảm count_promt đi 1
    user.count_promt -= 1;

    // Lưu thay đổi
    await user.save();

    res.status(200).json({
      message: "count_promt decreased successfully",
      count_promt: user.count_promt,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating count_promt", error: error.message });
  }
});

router.put(
  "/update-info/:id",
  upload.fields([{ name: "profile_image" }]),
  async (req, res) => {
    try {
      const userId = req.params.id;
      const fullName = req.body.full_name;

      const user = await User.findByPk(userId);

      if (!user) return res.status(404).json({ message: "User not found" });

      // Update user information
      if (fullName) {
        user.full_name = fullName;
      }

      // Handle file uploads
      let imageUrl = null;
      if (
        req.files &&
        req.files["profile_image"] &&
        req.files["profile_image"].length > 0
      ) {
        // Delete old image if it exists
        if (user.profile_image) {
          try {
            // Extract filename from the full URL
            const oldImageUrl = user.profile_image;
            const oldImagePath = oldImageUrl.split("/uploads/")[1];

            if (oldImagePath) {
              const fullPath = path.join(__dirname, "../uploads", oldImagePath);

              // Check if file exists before deleting
              if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
              }
            }
          } catch (deleteErr) {
            // Continue with the update even if delete fails
          }
        }

        // Save new image URL
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        imageUrl = `${baseUrl}/uploads/${req.files["profile_image"][0].filename}`;
        user.profile_image = imageUrl;
      }

      // Save user changes
      await user.save();

      res.status(200).json({
        message: "Profile updated successfully",
        user: {
          id: user.id,
          full_name: user.full_name,
          profile_image: user.profile_image,
        },
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error updating profile", error: error.message });
    }
  }
);

router.put("/change-password/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const currentPass = req.query.password;
    const newPassword = req.query.newPassword;
    const user = await User.findByPk(userId);

    if (!user)
      return res.status(404).json({ message: "Tài khoản không tồn tại" });

    // Kiểm tra mật khẩu cũ với mật khẩu đã mã hóa trong cơ sở dữ liệu
    const isMatch = await bcrypt.compare(currentPass, user.password_hash);

    if (!isMatch) {
      return res
        .status(200)
        .json({ message: "Mật khẩu hiện tại không chính xác!", type: 1 }); //type = 1: sai mật khẩu
    }
    // Mã hóa mật khẩu mới
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Cập nhật mật khẩu mới vào cơ sở dữ liệu
    user.password_hash = hashedNewPassword;
    await user.save();
    res.status(200).json({
      type: 2, // OK
      message: "Cập nhật mật khẩu thành công!",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Lỗi khi cập nhật mật khẩu", error: error.message });
  }
});
// Gửi email đặt lại mật khẩu
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.status(400).json({ error: "Email không tồn tại" });
    }

    // Tạo mã OTP
    const otp = generateOtp();
    user.otp_code = otp;
    user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // Hết hạn sau 10 phút
    await user.save();

    // Gửi email chứa mã OTP
    await sendOtpEmail(email, otp);

    sendDetailResponse(
      res,
      transformToCamelCase(null),
      "Yêu cầu đặt lại mật khẩu đã được gửi"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Đặt lại mật khẩu
router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body; // Thay token bằng otp
    const user = await User.findOne({ where: { email } });
    if (
      !user ||
      user.otp_code !== otp ||
      new Date() > new Date(user.otp_expires_at)
    ) {
      return res
        .status(400)
        .json({ error: "Mã OTP không hợp lệ hoặc đã hết hạn" });
    }

    // Mã hóa mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password_hash = hashedPassword;
    user.otp_code = null; // Xóa mã OTP sau khi sử dụng
    user.otp_expires_at = null;
    await user.save();

    res.json({ message: "Đặt lại mật khẩu thành công" });
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Cập nhật gói đăng ký của user (Cho phép thay đổi sub_id)
router.put(
  "/:id/subscriptions/:subId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { new_sub_id, status, start_date, end_date, token } = req.body;
      const userSub = await UserSub.findOne({
        where: { user_id: req.params.id, id: req.params.subId },
      });

      if (!userSub)
        return res.status(404).json({ message: "User subscription not found" });

      if (new_sub_id && new_sub_id !== userSub.sub_id) {
        const newSubscription = await Subscription.findByPk(new_sub_id);
        if (!newSubscription)
          return res
            .status(404)
            .json({ message: "New subscription not found" });
        userSub.sub_id = new_sub_id;
        userSub.end_date = new Date(
          new Date(start_date || userSub.start_date).getTime() +
            newSubscription.duration * 24 * 60 * 60 * 1000
        );
      }
      await userSub.update({
        sub_id: new_sub_id || userSub.sub_id,
        status: status !== undefined ? status : userSub.status,
        start_date: start_date || userSub.start_date,
        end_date: end_date || userSub.end_date,
        token: token !== undefined ? token : userSub.token,
      });
      await userSub.reload();
      res.json({
        message: "Subscription updated successfully",
        subscription: transformToCamelCase(userSub),
      });
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);
// Xem danh sách gói đăng ký của user
router.get(
  "/:id/subscriptions",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const subscriptions = await UserSub.findAll({
        where: { user_id: req.params.id },
        include: [
          {
            model: Subscription,
            attributes: [
              "id",
              "name_sub",
              "type",
              "duration",
              "price",
              "description",
            ],
          },
        ],
      });
      res.json(transformToCamelCase(subscriptions));
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// Thêm gói đăng ký mới cho user
router.post(
  "/:id/subscriptions",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { sub_id, start_date, end_date } = req.body;
      const user = await User.findByPk(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const subscription = await Subscription.findByPk(sub_id);
      if (!subscription)
        return res.status(404).json({ message: "Subscription not found" });

      const userSub = await UserSub.create({
        user_id: req.params.id,
        sub_id,
        start_date: start_date || new Date(),
        end_date:
          end_date ||
          new Date(
            new Date().setDate(new Date().getDate() + subscription.duration)
          ),
        status: 1,
      });
      res.json({
        message: "Subscription added successfully",
        subscription: transformToCamelCase(userSub),
      });
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);
// Xóa gói đăng ký của user
router.delete(
  "/:id/subscriptions/:subId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const userSub = await UserSub.findOne({
        where: { user_id: req.params.id, id: req.params.subId },
      });

      if (!userSub)
        return res.status(404).json({ message: "User subscription not found" });

      await userSub.destroy();
      res.json({ message: "Subscription deleted successfully" });
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);
// Thay đổi gói đăng ký (Chuyển sang gói mới và vô hiệu hóa gói cũ)
router.patch(
  "/:id/subscriptions/:subId/change",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { new_sub_id, start_date } = req.body;
      const user = await User.findByPk(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const currentUserSub = await UserSub.findOne({
        where: { user_id: req.params.id, id: req.params.subId },
      });
      if (!currentUserSub)
        return res
          .status(404)
          .json({ message: "Current subscription not found" });

      const newSubscription = await Subscription.findByPk(new_sub_id);
      if (!newSubscription)
        return res.status(404).json({ message: "New subscription not found" });

      // Vô hiệu hóa gói hiện tại
      currentUserSub.status = 2; // 2 = Không hoạt động
      await currentUserSub.save();

      // Tạo gói mới
      const newUserSub = await UserSub.create({
        user_id: req.params.id,
        sub_id: new_sub_id,
        start_date: start_date || new Date(),
        end_date: new Date(
          new Date(start_date || new Date()).getTime() +
            newSubscription.duration * 24 * 60 * 60 * 1000
        ),
        status: 1,
      });

      res.json({
        message: "Subscription changed successfully",
        newSubscription: transformToCamelCase(newUserSub),
      });
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);
router.post("/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const google_id = payload["sub"];
    const email = payload["email"];
    const name = payload["name"] || "Unknown";
    const picture = payload["picture"];
    let user = await User.findOne({
      where: { google_id },
      include: [
        {
          model: UserSub,
          // alias mặc định của hasMany là: Model name + 's' => 'UserSubs'
          // nhưng nếu viết sai như 'userSub' hoặc 'userSubs' thì sẽ lỗi
          include: [
            {
              model: Subscription,
              // alias mặc định là 'Subscription'
            },
          ],
        },
      ],
    });

    if (!user) {
      user = await User.findOne({ where: { email } });
      if (user) {
        user.google_id = google_id;
        user.profile_image = picture;
        await user.save();
      } else {
        user = await User.create({
          google_id: google_id,
          email,
          full_name: name,
          profile_image: picture,
          role: 1,
          is_verified: true,
          count_promt: 15,
        });
        await UserSub.create({
          user_id: user.id,
          sub_id: 1, // gói mặc định có id = 1
          status: 1, // trạng thái kích hoạt (nếu 1 là active)
          start_date: new Date(), // thời điểm hiện tại
          end_date: new Date(new Date().setMonth(new Date().getMonth() + 1)), // +1 tháng
          token: 5, // số token mặc định (hoặc cậu có thể để là 0)
        });
      }
    }

    // ✅ Lấy permissions từ role
    let permissions = [];
    if (user.Role && user.Role.permissions) {
      try {
        // Kiểm tra nếu permissions đã là array thì dùng trực tiếp, nếu là string thì parse
        permissions =
          typeof user.Role.permissions === "string"
            ? JSON.parse(user.Role.permissions)
            : user.Role.permissions;
      } catch (error) {
        permissions = [];
      }
    } else {
      // ✅ Fallback to default role permissions using utility function
      // Ưu tiên role_id trước, nếu không có thì dùng role cũ
      permissions = getRolePermissions(user.role_id || user.role);
    }

    // ✅ Tạo JWT token - hỗ trợ cả role cũ và role_id mới
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role, // ✅ Giữ nguyên cho backward compatible
        role_id: user.role_id, // ✅ Thêm mới cho role system
        role_name: user.Role?.name || user.getRoleName?.() || "User", // ✅ Thêm role name
        permissions: permissions, // ✅ Thêm permissions vào token
      },
      process.env.JWT_SECRET || "your_jwt_secret_key",
      { expiresIn: 60 * 60 * 24 * 30 * 6 }
    );

    // ✅ Use standardized user response builder
    const userData = {
      message: "Đăng nhập thành công",
      token,
      user: buildStandardUserResponse(
        user,
        permissions,
        user.UserSubs || [],
        token
      ),
    };

    return res.json(transformToCamelCase(userData));
  } catch (error) {
    return res.status(401).json({ error: "Google login failed" });
  }
});

// API Export Excel danh sách users
router.post(
  "/export-excel",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const XLSX = require("xlsx");

      // Lấy tham số từ request body - support both camelCase and snake_case
      let {
        search,
        searchTerm, // Support new format
        accountStatus,
        account_status,
        status, // Support new format
        isVerified,
        is_verified,
        role,
        dateRange,
        dateFrom, // Support new format
        dateTo, // Support new format
      } = req.body;

      // Normalize parameters - support both old and new formats
      const search_normalized = search || searchTerm;
      const account_status_normalized =
        accountStatus !== undefined
          ? accountStatus
          : account_status !== undefined
          ? account_status
          : status === "active"
          ? 1
          : status === "inactive"
          ? 0
          : status;
      const is_verified_normalized =
        isVerified !== undefined ? isVerified : is_verified;

      // Xây dựng điều kiện tìm kiếm
      const whereConditions = {};

      // Tìm kiếm theo tên hoặc email
      if (search_normalized) {
        whereConditions[Op.and] = whereConditions[Op.and] || [];
        whereConditions[Op.and].push({
          [Op.or]: [
            { full_name: { [Op.like]: `%${search_normalized}%` } },
            { email: { [Op.like]: `%${search_normalized}%` } },
          ],
        });
      }

      // Lọc theo trạng thái
      if (
        account_status_normalized !== undefined &&
        account_status_normalized !== null
      ) {
        const parsedStatus = parseInt(account_status_normalized);
        if (!isNaN(parsedStatus)) {
          whereConditions.account_status = parsedStatus;
        }
      }

      // Lọc theo tình trạng xác thực
      if (
        is_verified_normalized !== undefined &&
        is_verified_normalized !== null
      ) {
        if (typeof is_verified_normalized === "string") {
          whereConditions.is_verified = is_verified_normalized === "true";
        } else {
          whereConditions.is_verified = !!is_verified_normalized;
        }
      }

      // ✅ Lọc theo vai trò - sử dụng function chung
      await addRoleFilter(whereConditions, role);

      // Lọc theo dateRange nếu có (từ request body)
      // Hỗ trợ cả dateRange[from]/dateRange[to] và dateFrom/dateTo
      const dateFromValue =
        req.body.dateRange?.from ||
        req.body["dateRange[from]"] ||
        req.body.dateFrom ||
        dateFrom;
      const dateToValue =
        req.body.dateRange?.to ||
        req.body["dateRange[to]"] ||
        req.body.dateTo ||
        dateTo;

      if (dateFromValue || dateToValue) {
        whereConditions.created_at = {};
        if (dateFromValue) {
          // Nếu chỉ có ngày (YYYY-MM-DD), thêm thời gian 00:00:00
          const fromDate = new Date(dateFromValue);
          if (dateFromValue.length === 10) {
            // YYYY-MM-DD format
            fromDate.setHours(0, 0, 0, 0);
          }
          whereConditions.created_at[Op.gte] = fromDate;
        }
        if (dateToValue) {
          // Nếu chỉ có ngày (YYYY-MM-DD), thêm thời gian 23:59:59
          const toDate = new Date(dateToValue);
          if (dateToValue.length === 10) {
            // YYYY-MM-DD format
            toDate.setHours(23, 59, 59, 999);
          }
          whereConditions.created_at[Op.lte] = toDate;
        }
      }

      // Lấy tất cả users với thông tin subscription
      const users = await User.findAll({
        attributes: { exclude: ["password_hash"] },
        include: [
          {
            model: UserSub,
            attributes: ["sub_id", "status", "start_date", "end_date"],
            where: { status: 1 },
            required: false,
            include: [
              {
                model: Subscription,
                attributes: ["name_sub", "type", "price"],
              },
            ],
          },
        ],
        where: whereConditions,
        order: [["created_at", "DESC"]],
      });

      // Chuẩn bị dữ liệu cho Excel
      const excelData = users.map((user) => {
        const userSub = user.UserSubs?.[0];
        const subscription = userSub?.Subscription;

        return {
          ID: user.id,
          "Họ và tên": user.full_name || "",
          Email: user.email || "",
          "Số điện thoại": user.phone || "",
          "Trạng thái tài khoản":
            user.account_status === 1 ? "Hoạt động" : "Không hoạt động",
          "Đã xác thực": user.is_verified ? "Có" : "Không",
          "Vai trò": (() => {
            // ✅ Hỗ trợ cả role cũ và role_id mới
            if (user.Role) {
              return user.Role.name;
            }
            // Fallback cho role cũ
            const roleMap = {
              1: "User",
              2: "Admin",
              3: "Marketer",
            };
            return roleMap[user.role] || "Unknown";
          })(),
          "Số prompt còn lại": user.count_promt || 0,
          "Gói đăng ký": subscription?.name_sub || "Không có",
          "Loại gói": subscription?.type || "",
          "Giá gói": subscription?.price ? `${subscription.price} VND` : "",
          "Ngày bắt đầu gói": userSub?.start_date
            ? new Date(userSub.start_date).toLocaleDateString("vi-VN")
            : "",
          "Ngày kết thúc gói": userSub?.end_date
            ? new Date(userSub.end_date).toLocaleDateString("vi-VN")
            : "",
          "Ảnh đại diện": user.profile_image || "",
          "Ngày tạo": user.created_at
            ? new Date(user.created_at).toLocaleDateString("vi-VN")
            : "",
          "Ngày cập nhật": user.updated_at
            ? new Date(user.updated_at).toLocaleDateString("vi-VN")
            : "",
          "Google ID": user.google_id || "",
          "OTP Code": user.otp_code || "",
          "OTP Expires": user.otp_expires_at
            ? new Date(user.otp_expires_at).toLocaleDateString("vi-VN")
            : "",
        };
      });

      // Tạo workbook và worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Thiết lập độ rộng cột
      const columnWidths = [
        { wch: 5 }, // ID
        { wch: 25 }, // Họ và tên
        { wch: 30 }, // Email
        { wch: 15 }, // Số điện thoại
        { wch: 15 }, // Trạng thái tài khoản
        { wch: 12 }, // Đã xác thực
        { wch: 10 }, // Vai trò
        { wch: 15 }, // Số prompt còn lại
        { wch: 20 }, // Gói đăng ký
        { wch: 12 }, // Loại gói
        { wch: 15 }, // Giá gói
        { wch: 15 }, // Ngày bắt đầu gói
        { wch: 15 }, // Ngày kết thúc gói
        { wch: 50 }, // Ảnh đại diện
        { wch: 15 }, // Ngày tạo
        { wch: 15 }, // Ngày cập nhật
        { wch: 30 }, // Google ID
        { wch: 10 }, // OTP Code
        { wch: 15 }, // OTP Expires
      ];
      worksheet["!cols"] = columnWidths;

      // Thêm worksheet vào workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, "Danh sách Users");

      // Tạo buffer
      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      // Thiết lập headers cho download
      const fileName = `danh-sach-users-${
        new Date().toISOString().split("T")[0]
      }.xlsx`;

      // Encode filename để tránh lỗi encoding
      const encodedFileName = encodeURIComponent(fileName);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodedFileName}`
      );
      res.setHeader("Content-Length", excelBuffer.length);

      // Gửi file
      res.send(excelBuffer);
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// API Test Import với dữ liệu JSON
router.post(
  "/test-import",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { users } = req.body;

      if (!users || !Array.isArray(users)) {
        return sendErrorResponse(
          res,
          "Vui lòng cung cấp danh sách users",
          "INVALID_DATA",
          400
        );
      }

      const results = [];
      const errors = [];

      // Xử lý từng user
      for (let i = 0; i < users.length; i++) {
        const userData = users[i];
        const rowNumber = i + 1;

        try {
          // Validate dữ liệu bắt buộc
          if (!userData.firstName || !userData.lastName || !userData.email) {
            errors.push({
              row: rowNumber,
              error: "Thiếu thông tin bắt buộc: firstName, lastName, email",
              data: userData,
            });
            continue;
          }

          // Tạo full name
          const fullName = `${userData.firstName} ${userData.lastName}`.trim();
          const email = userData.email.trim();

          // Parse JoinedDate
          let joinedDate = new Date();
          if (userData.joinedDate) {
            joinedDate = new Date(userData.joinedDate);
            if (isNaN(joinedDate.getTime())) {
              errors.push({
                row: rowNumber,
                error: "Ngày tham gia không hợp lệ",
                data: userData,
              });
              continue;
            }
          }

          // Tính otp_expires_at (JoinedDate + 1 tháng)
          const otpExpiresAt = new Date(joinedDate);
          otpExpiresAt.setMonth(otpExpiresAt.getMonth() + 1);

          // Tìm user theo email hoặc firstName + lastName
          let existingUser = await User.findOne({
            where: {
              [Op.or]: [
                { email: email },
                {
                  [Op.and]: [
                    { full_name: { [Op.like]: `%${userData.firstName}%` } },
                    { full_name: { [Op.like]: `%${userData.lastName}%` } },
                  ],
                },
              ],
            },
          });

          if (existingUser) {
            // Cập nhật user hiện có (chỉ cập nhật các trường an toàn)
            const updateData = {
              full_name: fullName,
              otp_expires_at: otpExpiresAt,
            };

            // Chỉ cập nhật email nếu khác với email hiện tại và không có roleId
            if (existingUser.email !== email && !existingUser.role_id) {
              updateData.email = email;
            }

            // Chỉ cập nhật role nếu user hiện tại có role = 1 (User) và không có roleId
            if (existingUser.role === 1 && !existingUser.role_id) {
              updateData.role = 1; // Giữ nguyên role User
            }

            // Chỉ cập nhật account_status và is_verified nếu cần thiết
            if (existingUser.account_status !== 1) {
              updateData.account_status = 1;
            }
            if (!existingUser.is_verified) {
              updateData.is_verified = true;
            }

            try {
              await existingUser.update(updateData);
            } catch (updateError) {
              console.error(`Update error for ${email}:`, updateError);
              throw updateError;
            }

            results.push({
              action: "updated",
              email: email,
              fullName: fullName,
              joinedDate: joinedDate,
              otpExpiresAt: otpExpiresAt,
              currentRole: existingUser.role,
            });
          } else {
            // Tạo user mới
            const newUser = await User.create({
              full_name: fullName,
              email: email,
              password_hash: await bcrypt.hash("default123", 10), // Mật khẩu mặc định
              account_status: 1,
              role: 1, // User role
              is_verified: true,
              count_promt: 15,
              otp_expires_at: otpExpiresAt,
            });

            // Tạo subscription miễn phí cho user mới
            const freeSub = await Subscription.findOne({
              where: { type: 4 },
              attributes: ["id"],
            });

            if (freeSub) {
              await UserSub.create({
                user_id: newUser.id,
                sub_id: freeSub.id,
                status: 1,
                start_date: joinedDate,
                end_date: otpExpiresAt,
              });
            }

            results.push({
              action: "created",
              email: email,
              fullName: fullName,
              joinedDate: joinedDate,
              otpExpiresAt: otpExpiresAt,
            });
          }
        } catch (error) {
          console.error(`Error processing row ${rowNumber}:`, error);
          errors.push({
            row: rowNumber,
            error: error.message,
            data: userData,
          });
        }
      }

      sendDetailResponse(
        res,
        {
          totalProcessed: users.length,
          successCount: results.length,
          errorCount: errors.length,
          results: results,
          errors: errors,
        },
        "Import hoàn thành"
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// API Import CSV Users
router.post(
  "/import-csv",
  authMiddleware,
  adminMiddleware,
  csvUpload.single("csvFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        return sendErrorResponse(
          res,
          "Vui lòng upload file CSV",
          "MISSING_FILE",
          400
        );
      }

      const results = [];
      const errors = [];
      const filePath = req.file.path;

      // Đọc và xử lý file CSV
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on("data", (data) => {
            results.push(data);
          })
          .on("end", resolve)
          .on("error", reject);
      });

      // Xử lý từng dòng CSV
      for (let i = 0; i < results.length; i++) {
        const row = results[i];
        const rowNumber = i + 2; // +2 vì bắt đầu từ dòng 2 (có header)

        try {
          // Validate dữ liệu bắt buộc - hỗ trợ cả template cũ và mới
          if (!row.FirstName || !row.LastName || !row.Email) {
            errors.push({
              row: rowNumber,
              error: "Thiếu thông tin bắt buộc: FirstName, LastName, Email",
              data: row,
            });
            continue;
          }

          // Tạo full name
          const fullName = `${row.FirstName} ${row.LastName}`.trim();
          const email = row.Email.trim();

          // Parse JoinedDate
          let joinedDate = new Date();
          if (row.JoinedDate) {
            joinedDate = new Date(row.JoinedDate);
            if (isNaN(joinedDate.getTime())) {
              errors.push({
                row: rowNumber,
                error: "Ngày tham gia không hợp lệ",
                data: row,
              });
              continue;
            }
          }

          // Tính otp_expires_at (JoinedDate + 1 tháng)
          const otpExpiresAt = new Date(joinedDate);
          otpExpiresAt.setMonth(otpExpiresAt.getMonth() + 1);

          // Tìm user theo email hoặc firstName + lastName
          let existingUser = await User.findOne({
            where: {
              [Op.or]: [
                { email: email },
                {
                  [Op.and]: [
                    { full_name: { [Op.like]: `%${row.FirstName}%` } },
                    { full_name: { [Op.like]: `%${row.LastName}%` } },
                  ],
                },
              ],
            },
            include: [
              {
                model: UserSub,
                where: { status: 1 },
                required: false,
              },
            ],
          });

          if (existingUser) {
            // Cập nhật user hiện có (chỉ cập nhật các trường an toàn)
            const updateData = {
              full_name: fullName,
              otp_expires_at: otpExpiresAt,
            };

            // Chỉ cập nhật email nếu khác với email hiện tại và không có roleId
            if (existingUser.email !== email && !existingUser.role_id) {
              updateData.email = email;
            }

            // Chỉ cập nhật role nếu user hiện tại có role = 1 (User) và không có roleId
            if (existingUser.role === 1 && !existingUser.role_id) {
              updateData.role = 1; // Giữ nguyên role User
            }

            // Chỉ cập nhật account_status và is_verified nếu cần thiết
            if (existingUser.account_status !== 1) {
              updateData.account_status = 1;
            }
            if (!existingUser.is_verified) {
              updateData.is_verified = true;
            }

            try {
              await existingUser.update(updateData);

              // Cập nhật hoặc tạo subscription Premium cho user cũ
              if (existingUser.UserSubs && existingUser.UserSubs.length > 0) {
                // Cập nhật subscription hiện có thành Premium
                const userSub = existingUser.UserSubs[0];
                const premiumSub = await Subscription.findOne({
                  where: { type: 2 }, // Premium subscription
                  attributes: ["id", "name_sub", "duration"],
                });

                if (premiumSub) {
                  // Tính end_date = joinedDate + 1 tháng (không dùng duration của subscription)
                  const endDate = new Date(joinedDate);
                  endDate.setMonth(endDate.getMonth() + 1);

                  await userSub.update({
                    sub_id: premiumSub.id, // Chuyển sang Premium
                    start_date: joinedDate,
                    end_date: endDate,
                    // Giữ nguyên token hiện tại cho user cũ
                  });
                } else {
                  console.error(
                    `Premium subscription not found for existing user: ${email}`
                  );
                }
              } else {
                // Tạo subscription Premium mới nếu chưa có
                const premiumSub = await Subscription.findOne({
                  where: { type: 2 },
                  attributes: ["id", "name_sub", "duration"],
                });

                if (premiumSub) {
                  // Tính end_date = joinedDate + 1 tháng
                  const endDate = new Date(joinedDate);
                  endDate.setMonth(endDate.getMonth() + 1);

                  await UserSub.create({
                    user_id: existingUser.id,
                    sub_id: premiumSub.id,
                    status: 1,
                    start_date: joinedDate,
                    end_date: endDate,
                    token: 0, // User cũ không thêm token
                  });
                } else {
                  console.error(
                    `Premium subscription not found for existing user: ${email}`
                  );
                }
              }
            } catch (updateError) {
              console.error(`Update error for ${email}:`, updateError);
              throw updateError;
            }
          } else {
            // Tính countPrompt từ subscription trước khi tạo user
            let countPrompt = 15; // Default fallback
            let subscriptionResult = null;

            try {
              // Thử tạo Premium subscription để lấy countPrompt
              const premiumSub = await Subscription.findOne({
                where: { type: 2 },
                attributes: ["id", "name_sub", "duration"],
              });

              if (premiumSub) {
                countPrompt =
                  premiumSub.duration > 0 ? premiumSub.duration : 15;
              } else {
                // Fallback Free subscription
                const freeSub = await Subscription.findOne({
                  where: { type: 4 },
                  attributes: ["id", "name_sub", "duration"],
                });

                if (freeSub) {
                  countPrompt = freeSub.duration > 0 ? freeSub.duration : 15;
                }
              }
            } catch (subscriptionError) {
              console.error(
                `Error getting subscription for ${email}:`,
                subscriptionError.message
              );
            }

            // Tạo user mới với countPrompt từ subscription
            const newUser = await User.create({
              full_name: fullName,
              email: email,
              password_hash: await bcrypt.hash("default123", 10), // Mật khẩu mặc định
              account_status: 1,
              role: 1, // User role
              is_verified: true,
              count_promt: countPrompt, // Sử dụng countPrompt từ subscription
              otp_expires_at: otpExpiresAt,
            });

            // Tạo subscription cho user mới với end_date = joinedDate + 1 tháng
            try {
              // Tìm Premium subscription
              const premiumSub = await Subscription.findOne({
                where: { type: 2 },
                attributes: ["id", "name_sub", "duration"],
              });

              if (premiumSub) {
                // Tính end_date = joinedDate + 1 tháng (không dùng duration của subscription)
                const endDate = new Date(joinedDate);
                endDate.setMonth(endDate.getMonth() + 1);

                const userSub = await UserSub.create({
                  user_id: newUser.id,
                  sub_id: premiumSub.id,
                  status: 1,
                  start_date: joinedDate,
                  end_date: endDate,
                  token: 1000, // Premium có 1000 token
                });
              } else {
                // Fallback: Tạo Free subscription nếu không tìm thấy Premium
                const freeSub = await Subscription.findOne({
                  where: { type: 4 },
                  attributes: ["id", "name_sub", "duration"],
                });

                if (freeSub) {
                  // Tính end_date = joinedDate + 1 tháng
                  const endDate = new Date(joinedDate);
                  endDate.setMonth(endDate.getMonth() + 1);

                  const userSub = await UserSub.create({
                    user_id: newUser.id,
                    sub_id: freeSub.id,
                    status: 1,
                    start_date: joinedDate,
                    end_date: endDate,
                    token: 0, // Free không có token
                  });
                } else {
                  console.error(`No subscription found for new user: ${email}`);
                  errors.push({
                    row: rowNumber,
                    error: "Không tìm thấy subscription để gán cho user mới",
                    data: row,
                  });
                }
              }
            } catch (subscriptionError) {
              console.error(
                `Subscription creation failed for ${email}:`,
                subscriptionError.message
              );
              errors.push({
                row: rowNumber,
                error: `Lỗi tạo subscription: ${subscriptionError.message}`,
                data: row,
              });
            }
          }
        } catch (error) {
          errors.push({
            row: rowNumber,
            error: error.message,
            data: row,
          });
        }
      }

      // Xóa file tạm
      fs.unlinkSync(filePath);

      // Tạo file báo cáo lỗi nếu có
      let errorReportPath = null;
      if (errors.length > 0) {
        const errorReportPath = path.join(
          __dirname,
          "../uploads",
          `import-errors-${Date.now()}.csv`
        );

        const writer = csvWriter.createObjectCsvWriter({
          path: errorReportPath,
          header: [
            { id: "row", title: "Row" },
            { id: "error", title: "Error" },
            { id: "FirstName", title: "FirstName" },
            { id: "LastName", title: "LastName" },
            { id: "Email", title: "Email" },
            { id: "JoinedDate", title: "JoinedDate" },
          ],
        });

        await writer.writeRecords(errors);
      }

      // Thống kê chi tiết
      const stats = {
        totalProcessed: results.length,
        successCount: results.length - errors.length,
        errorCount: errors.length,
        newUsersCreated: 0,
        existingUsersUpdated: 0,
        premiumSubscriptionsCreated: 0,
        freeSubscriptionsCreated: 0,
      };

      sendDetailResponse(
        res,
        {
          ...stats,
          errors: errors,
          errorReportPath: errorReportPath,
        },
        "Import hoàn thành"
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// API để fix user có nhiều subscription active
router.post(
  "/fix-duplicate-subscriptions",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return sendErrorResponse(
          res,
          "User ID is required",
          "MISSING_USER_ID",
          400
        );
      }

      // Tìm tất cả subscription active của user
      const activeSubscriptions = await UserSub.findAll({
        where: {
          user_id: userId,
          status: 1,
        },
        include: [Subscription],
        order: [["id", "DESC"]], // Sắp xếp theo ID giảm dần (mới nhất trước)
      });

      if (activeSubscriptions.length <= 1) {
        return sendDetailResponse(
          res,
          {
            message: "User has no duplicate active subscriptions",
            activeSubscriptions: activeSubscriptions.length,
          },
          "No duplicates found"
        );
      }

      // Giữ lại subscription mới nhất (ID cao nhất), vô hiệu hóa các subscription cũ
      const keepSubscription = activeSubscriptions[0]; // Subscription mới nhất
      const deactivateSubscriptions = activeSubscriptions.slice(1); // Các subscription cũ

      // Vô hiệu hóa các subscription cũ
      const deactivatedIds = [];
      for (const sub of deactivateSubscriptions) {
        await sub.update({ status: 0 });
        deactivatedIds.push(sub.id);
      }

      sendDetailResponse(
        res,
        {
          userId: userId,
          keptSubscription: {
            id: keepSubscription.id,
            subId: keepSubscription.sub_id,
            subscriptionName: keepSubscription.Subscription?.name_sub,
            subscriptionType: keepSubscription.Subscription?.type,
            status: keepSubscription.status,
            startDate: keepSubscription.start_date,
            endDate: keepSubscription.end_date,
            token: keepSubscription.token,
          },
          deactivatedSubscriptions: deactivatedIds,
          totalActiveBefore: activeSubscriptions.length,
          totalActiveAfter: 1,
        },
        "Duplicate subscriptions fixed successfully"
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

// API để fix tất cả users có nhiều subscription active
router.post(
  "/fix-all-duplicate-subscriptions",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      // Tìm tất cả users có nhiều hơn 1 subscription active
      const usersWithDuplicates = await User.findAll({
        include: [
          {
            model: UserSub,
            where: { status: 1 },
            include: [Subscription],
          },
        ],
        having: sequelize.literal("COUNT(UserSubs.id) > 1"),
        group: ["User.id"],
      });

      const results = [];
      const errors = [];

      for (const user of usersWithDuplicates) {
        try {
          // Sắp xếp subscriptions theo ID giảm dần
          const sortedSubscriptions = user.UserSubs.sort((a, b) => b.id - a.id);

          // Giữ lại subscription mới nhất
          const keepSubscription = sortedSubscriptions[0];
          const deactivateSubscriptions = sortedSubscriptions.slice(1);

          // Vô hiệu hóa các subscription cũ
          const deactivatedIds = [];
          for (const sub of deactivateSubscriptions) {
            await sub.update({ status: 0 });
            deactivatedIds.push(sub.id);
          }

          results.push({
            userId: user.id,
            email: user.email,
            fullName: user.full_name,
            keptSubscription: {
              id: keepSubscription.id,
              subId: keepSubscription.sub_id,
              subscriptionName: keepSubscription.Subscription?.name_sub,
              subscriptionType: keepSubscription.Subscription?.type,
            },
            deactivatedCount: deactivatedIds.length,
            deactivatedIds: deactivatedIds,
          });
        } catch (error) {
          errors.push({
            userId: user.id,
            email: user.email,
            error: error.message,
          });
        }
      }

      sendDetailResponse(
        res,
        {
          totalUsersProcessed: usersWithDuplicates.length,
          successCount: results.length,
          errorCount: errors.length,
          results: results,
          errors: errors,
        },
        "All duplicate subscriptions fixed"
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

module.exports = router;
