const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Không có token xác thực" });
    }

    const token = authHeader.split(" ")[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user data to request
    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Token không hợp lệ" });
  }
};

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

module.exports = { authMiddleware, adminMiddleware };
