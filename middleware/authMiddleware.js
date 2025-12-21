const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cache = require("../utils/cache");

const BLACKLIST_PREFIX = "blacklist:token:";

/**
 * Hash token để tạo key ngắn gọn cho Redis
 */
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Không có token xác thực" });
    }

    const token = authHeader.split(" ")[1];

    // Check token blacklist TRƯỚC khi verify
    const tokenHash = hashToken(token);
    const isBlacklisted = await cache.getCache(`${BLACKLIST_PREFIX}${tokenHash}`);
    
    if (isBlacklisted) {
      return res.status(401).json({ message: "Token đã bị vô hiệu hóa" });
    }

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

module.exports = { authMiddleware, adminMiddleware, hashToken };
