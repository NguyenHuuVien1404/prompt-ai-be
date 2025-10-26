/**
 * VNPay Test Cases
 * Test cases cho VNPay integration
 */

const request = require("supertest");
const express = require("express");
const vnpayConfig = require("../config/vnpay");
const vnpayLogger = require("../utils/vnpayLogger");

// Mock data for testing
const mockPaymentData = {
  amount: 100000,
  bankCode: "NCB",
  orderInfo: "123-1",
  duration: 30,
  couponId: null,
  language: "vn",
};

const mockIPNData = {
  vnp_TxnRef: "12345678901234567890",
  vnp_ResponseCode: "00",
  vnp_TransactionNo: "1234567890",
  vnp_Amount: "10000000",
  vnp_PayDate: "20241201120000",
  vnp_BankCode: "NCB",
  vnp_IpAddr: "127.0.0.1",
  vnp_OrderInfo: "123-1",
  vnp_SecureHash: "mock_hash",
};

describe("VNPay Configuration Tests", () => {
  test("should create payment URL with valid parameters", () => {
    const params = {
      amount: 100000,
      orderId: "12345678901234567890",
      orderInfo: "123-1",
      bankCode: "NCB",
      ipAddr: "127.0.0.1",
      language: "vn",
    };

    const paymentUrl = vnpayConfig.createPaymentUrl(params);

    expect(paymentUrl).toBeDefined();
    expect(paymentUrl).toContain(
      "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
    );
    expect(paymentUrl).toContain("vnp_TxnRef=12345678901234567890");
    expect(paymentUrl).toContain("vnp_Amount=10000000");
  });

  test("should validate payment parameters correctly", () => {
    const validParams = {
      amount: 100000,
      orderInfo: "123-1",
    };

    const invalidParams = {
      amount: -1000,
      orderInfo: "invalid",
    };

    const validResult = vnpayConfig.validatePaymentParams(validParams);
    const invalidResult = vnpayConfig.validatePaymentParams(invalidParams);

    expect(validResult.isValid).toBe(true);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.errors.length).toBeGreaterThan(0);
  });

  test("should parse order info correctly", () => {
    const validOrderInfo = "123-1";
    const invalidOrderInfo = "invalid";

    const validResult = vnpayConfig.parseOrderInfo(validOrderInfo);
    const invalidResult = vnpayConfig.parseOrderInfo(invalidOrderInfo);

    expect(validResult.isValid).toBe(true);
    expect(validResult.userId).toBe(123);
    expect(validResult.subscriptionId).toBe(1);

    expect(invalidResult.isValid).toBe(false);
  });

  test("should generate unique order ID", () => {
    const orderId1 = vnpayConfig.generateOrderId();
    const orderId2 = vnpayConfig.generateOrderId();

    expect(orderId1).toBeDefined();
    expect(orderId2).toBeDefined();
    expect(orderId1).not.toBe(orderId2);
    expect(orderId1.length).toBeGreaterThan(10);
  });

  test("should get client IP from request", () => {
    const mockReq = {
      headers: {
        "x-forwarded-for": "192.168.1.1",
      },
      connection: {
        remoteAddress: "127.0.0.1",
      },
    };

    const ip = vnpayConfig.getClientIP(mockReq);
    expect(ip).toBe("192.168.1.1");
  });
});

describe("VNPay Logger Tests", () => {
  test("should log payment URL creation", () => {
    const params = {
      userId: 123,
      subscriptionId: 1,
      amount: 100000,
      paymentMethod: "VNPAY",
      couponId: null,
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0",
    };

    // This should not throw an error
    expect(() => {
      vnpayLogger.logPaymentUrlCreation(
        params,
        "12345678901234567890",
        "https://example.com"
      );
    }).not.toThrow();
  });

  test("should log IPN request", () => {
    const params = {
      vnp_TransactionNo: "1234567890",
      vnp_Amount: "10000000",
      vnp_PayDate: "20241201120000",
      vnp_BankCode: "NCB",
      vnp_IpAddr: "127.0.0.1",
    };

    // This should not throw an error
    expect(() => {
      vnpayLogger.logIPNRequest(params, "12345678901234567890", "00");
    }).not.toThrow();
  });

  test("should log payment result", () => {
    const result = {
      userId: 123,
      subscriptionId: 1,
      amount: 100000,
      transactionId: "1234567890",
      subscriptionName: "Premium Plan",
    };

    // This should not throw an error
    expect(() => {
      vnpayLogger.logPaymentResult("12345678901234567890", "SUCCESS", result);
    }).not.toThrow();
  });

  test("should log errors", () => {
    const error = new Error("Test error");
    const context = { orderId: "12345678901234567890" };

    // This should not throw an error
    expect(() => {
      vnpayLogger.logError("test_operation", error, context);
    }).not.toThrow();
  });

  test("should get log statistics", () => {
    const startDate = "2024-12-01";
    const endDate = "2024-12-02";

    const stats = vnpayLogger.getLogStatistics(startDate, endDate);

    expect(stats).toBeDefined();
    expect(stats.totalLogs).toBeDefined();
    expect(stats.byLevel).toBeDefined();
    expect(stats.errors).toBeDefined();
    expect(stats.warnings).toBeDefined();
    expect(stats.successfulPayments).toBeDefined();
    expect(stats.failedPayments).toBeDefined();
  });
});

describe("VNPay Security Middleware Tests", () => {
  const {
    validateVNPayRequest,
    validateAmountLimits,
    sanitizeVNPayInput,
  } = require("../middleware/vnpaySecurity");

  test("should validate VNPay request", () => {
    const mockReq = {
      method: "POST",
      get: jest.fn((header) => {
        if (header === "Content-Type") return "application/json";
        if (header === "User-Agent")
          return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
        return null;
      }),
    };

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const mockNext = jest.fn();

    validateVNPayRequest(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test("should validate amount limits", () => {
    const mockReq = {
      body: { amount: 100000 },
    };

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const mockNext = jest.fn();

    validateAmountLimits(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  test("should reject amount too low", () => {
    const mockReq = {
      body: { amount: 500 },
    };

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const mockNext = jest.fn();

    validateAmountLimits(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalled();
  });

  test("should reject amount too high", () => {
    const mockReq = {
      body: { amount: 200000000 },
    };

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const mockNext = jest.fn();

    validateAmountLimits(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalled();
  });

  test("should sanitize input data", () => {
    const mockReq = {
      body: {
        orderInfo: '123-1<script>alert("xss")</script>',
        amount: 100000,
      },
      query: {
        test: "value<>&\"'",
      },
    };

    const mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const mockNext = jest.fn();

    sanitizeVNPayInput(mockReq, mockRes, mockNext);

    expect(mockReq.body.orderInfo).not.toContain("<script>");
    expect(mockReq.query.test).not.toContain("<");
    expect(mockNext).toHaveBeenCalled();
  });
});

describe("VNPay Integration Tests", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock the payment routes
    const paymentRoutes = require("../routes/paymentRouters");
    app.use("/api/payment", paymentRoutes);
  });

  test("should create payment URL with valid data", async () => {
    const response = await request(app)
      .post("/api/payment/create_payment_url")
      .send(mockPaymentData)
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.paymentUrl).toBeDefined();
    expect(response.body.data.orderId).toBeDefined();
  });

  test("should reject payment URL creation with invalid data", async () => {
    const invalidData = {
      amount: -1000,
      orderInfo: "invalid",
      bankCode: "NCB",
    };

    const response = await request(app)
      .post("/api/payment/create_payment_url")
      .send(invalidData)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("validation");
  });

  test("should handle IPN callback", async () => {
    const response = await request(app)
      .get("/api/payment/vnpay_ipn")
      .query(mockIPNData)
      .expect(200);

    expect(response.body.RspCode).toBeDefined();
  });

  test("should query transaction", async () => {
    const queryData = {
      orderId: "12345678901234567890",
      transDate: "20241201",
    };

    // Mock the request-promise-native
    jest.mock("request-promise-native", () => ({
      __esModule: true,
      default: jest.fn().mockResolvedValue({
        RspCode: "00",
        Message: "Success",
      }),
    }));

    const response = await request(app)
      .post("/api/payment/querydr")
      .send(queryData)
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  test("should process refund", async () => {
    const refundData = {
      orderId: "12345678901234567890",
      transDate: "20241201",
      amount: 50000,
      transType: "03",
      user: "admin",
    };

    // Mock the request-promise-native
    jest.mock("request-promise-native", () => ({
      __esModule: true,
      default: jest.fn().mockResolvedValue({
        RspCode: "00",
        Message: "Refund successful",
      }),
    }));

    const response = await request(app)
      .post("/api/payment/refund")
      .send(refundData)
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  test("should get log statistics", async () => {
    const response = await request(app)
      .get("/api/payment/logs/stats")
      .query({
        startDate: "2024-12-01",
        endDate: "2024-12-02",
      })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.statistics).toBeDefined();
  });

  test("should clean old logs", async () => {
    const response = await request(app)
      .post("/api/payment/logs/clean")
      .send({ daysToKeep: 30 })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.message).toContain("Cleaned logs");
  });
});

describe("VNPay Error Handling Tests", () => {
  test("should handle network errors gracefully", async () => {
    // Mock network error
    jest.mock("request-promise-native", () => ({
      __esModule: true,
      default: jest.fn().mockRejectedValue(new Error("Network error")),
    }));

    const app = express();
    app.use(express.json());
    const paymentRoutes = require("../routes/paymentRouters");
    app.use("/api/payment", paymentRoutes);

    const response = await request(app)
      .post("/api/payment/querydr")
      .send({
        orderId: "12345678901234567890",
        transDate: "20241201",
      })
      .expect(500);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("Failed to query transaction");
  });

  test("should handle invalid signature", async () => {
    const app = express();
    app.use(express.json());
    const paymentRoutes = require("../routes/paymentRouters");
    app.use("/api/payment", paymentRoutes);

    const invalidIPNData = {
      ...mockIPNData,
      vnp_SecureHash: "invalid_hash",
    };

    const response = await request(app)
      .get("/api/payment/vnpay_ipn")
      .query(invalidIPNData)
      .expect(200);

    expect(response.body.RspCode).toBe("97");
    expect(response.body.Message).toContain("Invalid Checksum");
  });
});

// Performance tests
describe("VNPay Performance Tests", () => {
  test("should create payment URL within acceptable time", () => {
    const startTime = Date.now();

    const params = {
      amount: 100000,
      orderId: "12345678901234567890",
      orderInfo: "123-1",
      bankCode: "NCB",
      ipAddr: "127.0.0.1",
      language: "vn",
    };

    vnpayConfig.createPaymentUrl(params);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100); // Should complete within 100ms
  });

  test("should validate parameters within acceptable time", () => {
    const startTime = Date.now();

    const params = {
      amount: 100000,
      orderInfo: "123-1",
    };

    vnpayConfig.validatePaymentParams(params);

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(50); // Should complete within 50ms
  });
});

module.exports = {
  mockPaymentData,
  mockIPNData,
};
