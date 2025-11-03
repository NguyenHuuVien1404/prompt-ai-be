/**
 * VNPay Security Middleware
 * Middleware để bảo vệ các endpoint VNPay
 */

const rateLimit = require("express-rate-limit");
const vnpayConfig = require("../config/vnpay");

/**
 * Rate limiter cho VNPay endpoints
 */
const vnpayLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100, // Tối đa 100 requests per windowMs
  message: {
    success: false,
    message: "Too many VNPay requests, please try again later",
    code: "VNPAY_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for IPN callbacks from VNPay
    return req.path === "/vnpay_ipn" && req.method === "GET";
  },
});

/**
 * Middleware để validate VNPay request
 */
const validateVNPayRequest = (req, res, next) => {
  try {
    // Kiểm tra Content-Type cho POST requests
    if (req.method === "POST") {
      const contentType = req.get("Content-Type");
      if (!contentType || !contentType.includes("application/json")) {
        return res.status(400).json({
          success: false,
          message: "Content-Type must be application/json",
          code: "INVALID_CONTENT_TYPE",
        });
      }
    }

    // Kiểm tra User-Agent để tránh bot requests
    const userAgent = req.get("User-Agent");
    if (!userAgent || userAgent.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Invalid User-Agent",
        code: "INVALID_USER_AGENT",
      });
    }

    // Kiểm tra Referer cho một số endpoints
    if (req.path === "/create_payment_url" && req.method === "POST") {
      const referer = req.get("Referer");
      if (!referer) {
        console.warn(
          `Missing Referer header for payment URL creation from IP: ${req.ip}`
        );
      }
    }

    next();
  } catch (error) {
    console.error("Error in VNPay validation middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  }
};

/**
 * Middleware để log VNPay requests
 */
const logVNPayRequest = (req, res, next) => {
  const startTime = Date.now();

  // Request processing

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Middleware để validate IP whitelist cho IPN
 */
const validateIPNIP = (req, res, next) => {
  // Danh sách IP của VNPay (cần cập nhật theo thông tin từ VNPay)
  const vnpayIPs = [
    "127.0.0.1", // Localhost for testing
    "203.162.235.1", // VNPay IP (example)
    "203.162.235.2", // VNPay IP (example)
    // Thêm các IP khác của VNPay khi có thông tin chính thức
  ];

  const clientIP = req.ip || req.connection.remoteAddress;

  // Chỉ áp dụng cho IPN endpoint
  if (req.path === "/vnpay_ipn") {
    if (!vnpayIPs.includes(clientIP)) {
      console.warn(`Unauthorized IPN request from IP: ${clientIP}`);
      return res.status(403).json({
        RspCode: "97",
        Message: "Unauthorized IP",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }
  }

  next();
};

/**
 * Middleware để sanitize input data
 */
const sanitizeVNPayInput = (req, res, next) => {
  try {
    // Sanitize string inputs
    const sanitizeString = (str) => {
      if (typeof str !== "string") return str;
      return str.replace(/[<>\"'&]/g, (match) => {
        const escapeMap = {
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#x27;",
          "&": "&amp;",
        };
        return escapeMap[match];
      });
    };

    // Sanitize request body
    if (req.body) {
      for (const key in req.body) {
        if (typeof req.body[key] === "string") {
          req.body[key] = sanitizeString(req.body[key]);
        }
      }
    }

    // Sanitize query parameters
    if (req.query) {
      for (const key in req.query) {
        if (typeof req.query[key] === "string") {
          req.query[key] = sanitizeString(req.query[key]);
        }
      }
    }

    next();
  } catch (error) {
    console.error("Error in sanitization middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Input sanitization error",
      code: "SANITIZATION_ERROR",
    });
  }
};

/**
 * Middleware để validate amount limits
 */
const validateAmountLimits = (req, res, next) => {
  try {
    if (req.body && req.body.amount) {
      const amount = parseFloat(req.body.amount);

      // Kiểm tra giới hạn số tiền
      if (amount < 1000) {
        // Tối thiểu 10,000 VND
        return res.status(400).json({
          success: false,
          message: "Amount must be at least 10,000 VND",
          code: "AMOUNT_TOO_LOW",
        });
      }

      if (amount > 100000000) {
        // Tối đa 1,000,000,000 VND
        return res.status(400).json({
          success: false,
          message: "Amount exceeds maximum limit",
          code: "AMOUNT_TOO_HIGH",
        });
      }
    }

    next();
  } catch (error) {
    console.error("Error in amount validation middleware:", error);
    return res.status(500).json({
      success: false,
      message: "Amount validation error",
      code: "AMOUNT_VALIDATION_ERROR",
    });
  }
};

module.exports = {
  vnpayLimiter,
  validateVNPayRequest,
  logVNPayRequest,
  validateIPNIP,
  sanitizeVNPayInput,
  validateAmountLimits,
};
