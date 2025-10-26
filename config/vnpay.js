/**
 * VNPay Configuration Module
 * Cấu hình và utilities cho VNPay integration
 */

const crypto = require("crypto");
const querystring = require("qs");
const moment = require("moment");

class VNPayConfig {
  constructor() {
    this.tmnCode = process.env.VNP_TMNCODE || "your_vnpay_tmncode_here";
    this.secretKey =
      process.env.VNP_HASHSECRET || "your_vnpay_hash_secret_here";
    this.vnpUrl =
      process.env.VNP_URL ||
      "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html";
    this.returnUrl =
      process.env.VNP_RETURNURL ||
      "https://yourdomain.com/api/payment/vnpay_return";
    this.apiUrl =
      process.env.VNP_API ||
      "https://sandbox.vnpayment.vn/merchant_webapi/api/transaction";
    this.version = "2.1.0";
    this.command = "pay";
    this.currCode = "VND";
    this.locale = "vn";
    this.orderType = "other";
  }

  /**
   * Tạo URL thanh toán VNPay
   * @param {Object} params - Tham số thanh toán
   * @returns {string} URL thanh toán
   */
  createPaymentUrl(params) {
    const {
      amount,
      orderId,
      orderInfo,
      bankCode = null,
      ipAddr,
      language = "vn",
    } = params;

    const createDate = moment().format("YYYYMMDDHHmmss");

    const vnpParams = {
      vnp_Version: this.version,
      vnp_Command: this.command,
      vnp_TmnCode: this.tmnCode,
      vnp_Locale: language,
      vnp_CurrCode: this.currCode,
      vnp_TxnRef: orderId,
      vnp_OrderInfo: orderInfo,
      vnp_OrderType: this.orderType,
      vnp_Amount: amount * 100, // VNPay yêu cầu nhân 100
      vnp_ReturnUrl: this.returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate,
    };

    if (bankCode) {
      vnpParams.vnp_BankCode = bankCode;
    }

    // Sắp xếp tham số theo alphabet
    const sortedParams = this.sortObject(vnpParams);

    // Tạo chữ ký
    const signData = querystring.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac("sha512", this.secretKey);
    const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

    sortedParams.vnp_SecureHash = signed;

    return (
      this.vnpUrl + "?" + querystring.stringify(sortedParams, { encode: false })
    );
  }

  /**
   * Xác thực chữ ký từ VNPay callback
   * @param {Object} params - Tham số từ VNPay
   * @returns {boolean} Kết quả xác thực
   */
  verifySignature(params) {
    const secureHash = params.vnp_SecureHash;
    delete params.vnp_SecureHash;
    delete params.vnp_SecureHashType;

    const sortedParams = this.sortObject(params);
    const signData = querystring.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac("sha512", this.secretKey);
    const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

    return secureHash === signed;
  }

  /**
   * Tạo dữ liệu truy vấn giao dịch
   * @param {Object} params - Tham số truy vấn
   * @returns {Object} Dữ liệu truy vấn
   */
  createQueryData(params) {
    const { orderId, transDate, ipAddr } = params;

    const createDate = moment().format("YYYYMMDDHHmmss");
    const requestId = moment().format("HHmmss");
    const orderInfo = `Truy van GD ma:${orderId}`;

    const data = [
      requestId,
      this.version,
      "querydr",
      this.tmnCode,
      orderId,
      transDate,
      createDate,
      ipAddr,
      orderInfo,
    ].join("|");

    const hmac = crypto.createHmac("sha512", this.secretKey);
    const secureHash = hmac.update(Buffer.from(data, "utf-8")).digest("hex");

    return {
      vnp_RequestId: requestId,
      vnp_Version: this.version,
      vnp_Command: "querydr",
      vnp_TmnCode: this.tmnCode,
      vnp_TxnRef: orderId,
      vnp_OrderInfo: orderInfo,
      vnp_TransactionDate: transDate,
      vnp_CreateDate: createDate,
      vnp_IpAddr: ipAddr,
      vnp_SecureHash: secureHash,
    };
  }

  /**
   * Tạo dữ liệu hoàn tiền
   * @param {Object} params - Tham số hoàn tiền
   * @returns {Object} Dữ liệu hoàn tiền
   */
  createRefundData(params) {
    const { orderId, transDate, amount, transType, user, ipAddr } = params;

    const createDate = moment().format("YYYYMMDDHHmmss");
    const requestId = moment().format("HHmmss");
    const orderInfo = `Hoan tien GD ma:${orderId}`;
    const transactionNo = "0";

    const data = [
      requestId,
      this.version,
      "refund",
      this.tmnCode,
      transType,
      orderId,
      amount * 100, // VNPay yêu cầu nhân 100
      transactionNo,
      transDate,
      user,
      createDate,
      ipAddr,
      orderInfo,
    ].join("|");

    const hmac = crypto.createHmac("sha512", this.secretKey);
    const secureHash = hmac.update(Buffer.from(data, "utf-8")).digest("hex");

    return {
      vnp_RequestId: requestId,
      vnp_Version: this.version,
      vnp_Command: "refund",
      vnp_TmnCode: this.tmnCode,
      vnp_TransactionType: transType,
      vnp_TxnRef: orderId,
      vnp_Amount: amount * 100,
      vnp_TransactionNo: transactionNo,
      vnp_CreateBy: user,
      vnp_OrderInfo: orderInfo,
      vnp_TransactionDate: transDate,
      vnp_CreateDate: createDate,
      vnp_IpAddr: ipAddr,
      vnp_SecureHash: secureHash,
    };
  }

  /**
   * Sắp xếp object theo thứ tự alphabet
   * @param {Object} obj - Object cần sắp xếp
   * @returns {Object} Object đã sắp xếp
   */
  sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();

    keys.forEach((key) => {
      sorted[key] = encodeURIComponent(obj[key]).replace(/%20/g, "+");
    });

    return sorted;
  }

  /**
   * Lấy IP address từ request
   * @param {Object} req - Express request object
   * @returns {string} IP address
   */
  getClientIP(req) {
    return (
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress ||
      "127.0.0.1"
    );
  }

  /**
   * Tạo order ID duy nhất
   * @returns {string} Order ID
   */
  generateOrderId() {
    const timestamp = moment().format("DDHHmmss");
    const random = Math.floor(100000 + Math.random() * 900000);
    return `${timestamp}${random}`;
  }

  /**
   * Validate payment parameters
   * @param {Object} params - Tham số thanh toán
   * @returns {Object} Kết quả validation
   */
  validatePaymentParams(params) {
    const errors = [];

    if (!params.amount || params.amount <= 0) {
      errors.push("Amount must be greater than 0");
    }

    if (!params.orderInfo || !params.orderInfo.includes("-")) {
      errors.push("OrderInfo must be in format: userId-subscriptionId");
    }

    if (params.amount && params.amount > 100000000) {
      // 100 triệu VND
      errors.push("Amount exceeds maximum limit");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse order info to extract user and subscription IDs
   * @param {string} orderInfo - Order info string
   * @returns {Object} Parsed order info
   */
  parseOrderInfo(orderInfo) {
    if (!orderInfo || !orderInfo.includes("-")) {
      return { isValid: false, error: "Invalid orderInfo format" };
    }

    const parts = orderInfo.split("-").map(Number);
    const userId = parts[0];
    const subscriptionId = parts[1];

    if (!userId || !subscriptionId || isNaN(userId) || isNaN(subscriptionId)) {
      return { isValid: false, error: "Invalid user_id or subscription_id" };
    }

    return {
      isValid: true,
      userId,
      subscriptionId,
    };
  }
}

module.exports = new VNPayConfig();
