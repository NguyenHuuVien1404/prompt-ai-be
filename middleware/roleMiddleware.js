const jwt = require("jsonwebtoken");

// Middleware kiểm tra vai trò admin
const adminMiddleware = (req, res, next) => {
  // ✅ Hỗ trợ cả role cũ và role_id mới
  const isAdmin =
    (req.user && req.user.role === 2) || (req.user && req.user.role_id === 2);

  if (isAdmin) {
    next();
  } else {
    res.status(403).json({ message: "Không có quyền truy cập" });
  }
};

// Middleware kiểm tra vai trò marketer
const marketerMiddleware = (req, res, next) => {
  // ✅ Hỗ trợ cả role cũ và role_id mới
  const isMarketer =
    (req.user && req.user.role === 3) || (req.user && req.user.role_id === 3);

  if (isMarketer) {
    next();
  } else {
    res.status(403).json({ message: "Không có quyền truy cập" });
  }
};

// Middleware kiểm tra vai trò admin hoặc marketer (role > 1)
const adminOrMarketerMiddleware = (req, res, next) => {
  // ✅ Hỗ trợ cả role cũ và role_id mới
  // Chỉ cần check role > 1 (Admin, Marketer, hoặc các role khác trong tương lai)
  const userRole = req.user?.role || req.user?.role_id;

  if (userRole && userRole > 1) {
    next();
  } else {
    res.status(403).json({ message: "Không có quyền truy cập" });
  }
};

// Middleware kiểm tra vai trò generic
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.user?.role_id;
    const userRoleName = req.user?.role_name;

    // ✅ Hỗ trợ cả role number và role name
    const hasPermission = allowedRoles.some((allowedRole) => {
      if (typeof allowedRole === "number") {
        return userRole === allowedRole;
      }
      if (typeof allowedRole === "string") {
        return userRoleName === allowedRole;
      }
      return false;
    });

    if (hasPermission) {
      next();
    } else {
      res.status(403).json({ message: "Không có quyền truy cập" });
    }
  };
};

module.exports = {
  adminMiddleware,
  marketerMiddleware,
  adminOrMarketerMiddleware,
  checkRole,
};
