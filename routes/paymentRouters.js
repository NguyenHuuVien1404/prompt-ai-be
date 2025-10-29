/**
 * Created by CTT VNPAY
 * Updated with enhanced VNPay integration
 */

let express = require("express");
let router = express.Router();
const request = require("request-promise-native");
const moment = require("moment");
const crypto = require("crypto");
const querystring = require("qs");
const axios = require("axios");
const XLSX = require("xlsx");
const UserSub = require("../models/UserSub");
const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription"); // Thêm model Subscription để lấy thông tin duration, token
const User = require("../models/User");
const Coupon = require("../models/Coupon"); // Implied import for Coupon model
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

// Import VNPay configuration
const vnpayConfig = require("../config/vnpay");

// Import VNPay security middleware
const {
  vnpayLimiter,
  validateVNPayRequest,
  logVNPayRequest,
  validateIPNIP,
  sanitizeVNPayInput,
  validateAmountLimits,
} = require("../middleware/vnpaySecurity");

// Import VNPay logger
const vnpayLogger = require("../utils/vnpayLogger");
const { sendSkoolInviteEmail } = require("../utils/emailService");

// Apply VNPay security middleware to all routes except vnpay_return
router.use((req, res, next) => {
  // Skip middleware for vnpay_return endpoint
  if (req.path === "/vnpay_return") {
    return next();
  }
  return vnpayLimiter(req, res, next);
});

router.use((req, res, next) => {
  // Skip middleware for vnpay_return endpoint
  if (req.path === "/vnpay_return") {
    return next();
  }
  return validateVNPayRequest(req, res, next);
});

router.use((req, res, next) => {
  // Skip middleware for vnpay_return endpoint
  if (req.path === "/vnpay_return") {
    return next();
  }
  return logVNPayRequest(req, res, next);
});
router.use((req, res, next) => {
  // Skip middleware for vnpay_return endpoint
  if (req.path === "/vnpay_return") {
    return next();
  }
  return sanitizeVNPayInput(req, res, next);
});

router.get("/", async function (req, res, next) {
  try {
    const {
      page = 1,
      pageIndex = 1,
      limit = 10,
      pageSize = 10,
      status,
      start_date,
      end_date,
      dateFrom,
      dateTo,
      name,
      email,
      code,
      subscription,
      subscriptionIds: querySubscriptionIds,
      searchTerm,
    } = req.query;

    const currentPage = parseInt(pageIndex || page) || 1;
    const currentLimit = parseInt(pageSize || limit) || 10;
    const offset = (currentPage - 1) * currentLimit;

    // Xây dựng điều kiện where
    const where = {};
    if (status) where.payment_status = status;

    // Handle subscription filtering - prioritize subscriptionIds over single subscription
    if (querySubscriptionIds) {
      let ids = [];
      if (typeof querySubscriptionIds === "string") {
        // Handle comma-separated string: "1,2,3"
        ids = querySubscriptionIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else if (Array.isArray(querySubscriptionIds)) {
        // Handle array: [1,2,3]
        ids = querySubscriptionIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      }

      if (ids.length > 0) {
        where.subscription_id = { [Op.in]: ids };
      }
    } else if (subscription) {
      where.subscription_id = parseInt(subscription);
    }

    // Support both date parameter naming conventions
    const startDate = start_date || dateFrom;
    const endDate = end_date || dateTo;

    if (startDate || endDate) {
      where.payment_date = {};
      if (startDate) where.payment_date[Op.gte] = new Date(startDate);
      if (endDate) where.payment_date[Op.lte] = new Date(endDate);
    }

    // Nếu có truyền code, tìm coupon_id
    if (code) {
      const coupon = await Coupon.findOne({ where: { code } });
      if (coupon) {
        where.coupon_id = coupon.id;
      } else {
        // Không tìm thấy coupon, trả về rỗng luôn
        return sendListResponse(res, [], {
          total: 0,
          page: currentPage,
          limit: currentLimit,
          totalPages: 0,
        });
      }
    }

    // Join với User để filter theo tên hoặc email
    const include = [];
    if (name || email) {
      const userWhere = {};
      if (name) userWhere.full_name = { [Op.like]: `%${name}%` };
      if (email) userWhere.email = { [Op.like]: `%${email}%` };
      include.push({
        model: User,
        attributes: ["id", "full_name", "email"],
        where: userWhere,
      });
    } else {
      include.push({
        model: User,
        attributes: ["id", "full_name", "email"],
      });
    }

    // If searchTerm is provided, search across multiple fields using OR
    if (searchTerm) {
      where[Op.or] = [
        { transaction_id: { [Op.like]: `%${searchTerm}%` } },
        { orderId: { [Op.like]: `%${searchTerm}%` } },
        { notes: { [Op.like]: `%${searchTerm}%` } },
        // Search in User fields using subquery
        sequelize.literal(`EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = Payment.user_id 
          AND (users.full_name LIKE ${sequelize.escape(
            `%${searchTerm}%`
          )} OR users.email LIKE ${sequelize.escape(`%${searchTerm}%`)})
        )`),
      ];
    }

    // Get total count without includes to avoid JOIN counting issues
    const totalCount = await Payment.count({ where });

    // Get actual data with includes
    const rows = await Payment.findAll({
      where,
      include,
      limit: currentLimit,
      offset: offset,
      order: [["payment_date", "DESC"]],
    });

    // Lấy tất cả coupon_id duy nhất từ kết quả
    const couponIds = [
      ...new Set(rows.map((p) => p.coupon_id).filter(Boolean)),
    ];
    // Lấy thông tin coupon cho các coupon_id này
    const coupons = await Coupon.findAll({
      where: { id: couponIds },
    });
    // Map coupon_id -> coupon data (ép key về string)
    const couponMap = {};
    coupons.forEach((c) => {
      couponMap[String(c.id)] = c;
    });

    // Lấy tất cả subscription_id duy nhất từ kết quả
    const subscriptionIds = [
      ...new Set(rows.map((p) => p.subscription_id).filter(Boolean)),
    ];
    const subscriptions = await Subscription.findAll({
      where: { id: subscriptionIds },
    });
    const subscriptionMap = {};
    subscriptions.forEach((s) => {
      subscriptionMap[String(s.id)] = s;
    });

    // Gắn data coupon và price vào từng payment và chỉ trả về các trường cần thiết
    const result = rows.map((payment) => {
      const p = payment.toJSON();
      const coupon = p.coupon_id
        ? couponMap[String(p.coupon_id)]
          ? couponMap[String(p.coupon_id)].toJSON()
          : null
        : null;
      const subscription = p.subscription_id
        ? subscriptionMap[String(p.subscription_id)]
        : null;
      return {
        id: p.id,
        subscriptionId: p.subscription_id,
        price: subscription ? subscription.price : null,
        amount: p.amount,
        paymentMethod: p.payment_method,
        transactionId: p.transaction_id,
        paymentStatus: p.payment_status,
        paymentDate: p.payment_date,
        user: p.User
          ? {
              id: p.User.id,
              fullName: p.User.full_name,
              email: p.User.email,
            }
          : null,
        coupon: coupon
          ? {
              id: coupon.id,
              code: coupon.code,
              discount: coupon.discount,
              type: coupon.type,
              expiryDate: coupon.expiry_date,
              isActive: coupon.is_active,
              createdAt: coupon.created_at,
            }
          : null,
      };
    });

    const pagination = calculatePagination(
      totalCount,
      currentPage,
      currentLimit
    );
    sendListResponse(res, transformToCamelCase(result), pagination);
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Lỗi khi lấy danh sách payments: " + error.message
    );
  }
});

router.get("/payment/:id", async function (req, res, next) {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return sendErrorResponse(
        res,
        "Invalid payment ID",
        "VALIDATION_ERROR",
        400
      );
    }

    const payment = await Payment.findByPk(id, {
      include: [
        {
          model: User,
          attributes: ["id", "full_name", "email"],
        },
        {
          model: Coupon,
          attributes: [
            "id",
            "code",
            "discount",
            "type",
            "expiry_date",
            "is_active",
            "created_at",
          ],
        },
        {
          model: Subscription,
          attributes: ["id", "name_sub", "price", "duration", "billing_cycle"],
        },
      ],
    });

    if (!payment) {
      return sendNotFoundResponse(res, "Payment not found");
    }

    const result = {
      id: payment.id,
      subscriptionId: payment.subscription_id,
      amount: payment.amount,
      paymentMethod: payment.payment_method,
      transactionId: payment.transaction_id,
      paymentStatus: payment.payment_status,
      paymentDate: payment.payment_date,
      duration: payment.duration,
      orderId: payment.order_id,
      notes: payment.notes,
      createdAt: payment.created_at,
      updatedAt: payment.updated_at,
      user: payment.User
        ? {
            id: payment.User.id,
            fullName: payment.User.full_name,
            email: payment.User.email,
          }
        : null,
      coupon: payment.Coupon
        ? {
            id: payment.Coupon.id,
            code: payment.Coupon.code,
            discount: payment.Coupon.discount,
            type: payment.Coupon.type,
            expiryDate: payment.Coupon.expiry_date,
            isActive: payment.Coupon.is_active,
            createdAt: payment.Coupon.created_at,
          }
        : null,
      subscription: payment.Subscription
        ? {
            id: payment.Subscription.id,
            nameSub: payment.Subscription.name_sub,
            price: payment.Subscription.price,
            duration: payment.Subscription.duration,
            billingCycle: payment.Subscription.billing_cycle,
          }
        : null,
    };

    sendDetailResponse(res, transformToCamelCase(result));
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Error retrieving payment details: " + error.message
    );
  }
});

router.get("/create_payment_url", function (req, res, next) {
  sendDetailResponse(res, {
    message: "Create payment URL endpoint",
    title: "Tạo mới đơn hàng",
    amount: 10000,
  });
});

router.get("/querydr", function (req, res, next) {
  let desc = "truy van ket qua thanh toan";
  sendDetailResponse(res, {
    message: "Query transaction endpoint",
    title: "Truy vấn kết quả thanh toán",
    description: desc,
  });
});

router.get("/refund", function (req, res, next) {
  let desc = "Hoan tien GD thanh toan";
  sendDetailResponse(res, {
    message: "Refund endpoint",
    title: "Hoàn tiền giao dịch thanh toán",
    description: desc,
  });
});

router.post(
  "/create_payment_url",
  validateAmountLimits,
  async function (req, res, next) {
    try {
      process.env.TZ = "Asia/Ho_Chi_Minh";

      const {
        amount,
        bankCode,
        orderInfo,
        duration,
        couponId,
        couponCode,
        language = "vn",
      } = req.body;

      // Validate input parameters
      const validation = vnpayConfig.validatePaymentParams({
        amount: parseFloat(amount),
        orderInfo,
      });

      if (!validation.isValid) {
        return sendErrorResponse(
          res,
          validation.errors.join(", "),
          "VALIDATION_ERROR",
          400
        );
      }

      // Parse order info
      const orderInfoParsed = vnpayConfig.parseOrderInfo(orderInfo);
      if (!orderInfoParsed.isValid) {
        return sendErrorResponse(
          res,
          orderInfoParsed.error,
          "VALIDATION_ERROR",
          400
        );
      }

      const { userId, subscriptionId } = orderInfoParsed;

      // Verify user and subscription exist
      const user = await User.findByPk(userId);
      if (!user) {
        return sendErrorResponse(res, "User not found", "USER_NOT_FOUND", 404);
      }

      const subscription = await Subscription.findByPk(subscriptionId);
      if (!subscription) {
        return sendErrorResponse(
          res,
          "Subscription not found",
          "SUBSCRIPTION_NOT_FOUND",
          404
        );
      }

      // Verify coupon if provided
      let finalCouponId = couponId;
      if (couponCode && !couponId) {
        // Find coupon by code
        const couponByCode = await Coupon.findOne({
          where: { code: couponCode },
        });
        if (couponByCode) {
          finalCouponId = couponByCode.id;
        }
      }

      if (finalCouponId) {
        const coupon = await Coupon.findByPk(finalCouponId);
        if (!coupon || !coupon.is_active) {
          return sendErrorResponse(
            res,
            "Invalid or inactive coupon",
            "INVALID_COUPON",
            400
          );
        }

        // Check coupon expiry
        if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
          return sendErrorResponse(
            res,
            "Coupon has expired",
            "COUPON_EXPIRED",
            400
          );
        }

        console.log(`Coupon validated: ${coupon.code} (ID: ${coupon.id})`);
      }

      // Generate unique order ID
      const orderId = vnpayConfig.generateOrderId();
      const ipAddr = vnpayConfig.getClientIP(req);

      // Create payment record with PENDING status
      const payment = await Payment.create({
        user_id: userId,
        subscription_id: subscriptionId,
        amount: parseFloat(amount),
        payment_method: bankCode || "VNPAY",
        transaction_id: null,
        payment_status: "PENDING",
        payment_date: new Date(),
        duration: duration,
        orderId: orderId,
        coupon_id: finalCouponId,
        notes: `VNPay Transaction: ${orderId}`,
      });

      console.log(
        `Payment created with coupon_id: ${finalCouponId}, orderId: ${orderId}`
      );

      // Create VNPay payment URL
      const paymentUrl = vnpayConfig.createPaymentUrl({
        amount: parseFloat(amount),
        orderId,
        orderInfo,
        bankCode,
        ipAddr,
        language,
      });

      // Log successful payment URL creation
      vnpayLogger.logPaymentUrlCreation(
        {
          userId,
          subscriptionId,
          amount: parseFloat(amount),
          paymentMethod: bankCode || "VNPAY",
          couponId,
          ipAddress: ipAddr,
          userAgent: req.get("User-Agent"),
        },
        orderId,
        paymentUrl
      );

      sendCreateResponse(
        res,
        transformToCamelCase({
          paymentUrl,
          orderId,
          amount: parseFloat(amount),
          subscription: {
            id: subscription.id,
            name: subscription.name_sub,
            price: subscription.price,
          },
        }),
        "Payment URL created successfully"
      );
    } catch (error) {
      vnpayLogger.logError("create_payment_url", error, {
        userId: req.body.userId,
        subscriptionId: req.body.subscriptionId,
        amount: req.body.amount,
      });
      sendInternalErrorResponse(
        res,
        "Failed to create payment URL: " + error.message
      );
    }
  }
);

// Handle both GET and POST requests for VNPay return
router.all("/vnpay_return", async function (req, res, next) {
  try {
    // Handle both GET (query) and POST (body) parameters
    const vnp_Params =
      req.method === "GET" ? req.query : { ...req.query, ...req.body };
    const secureHash = vnp_Params["vnp_SecureHash"];
    const orderId = vnp_Params["vnp_TxnRef"];
    const responseCode = vnp_Params["vnp_ResponseCode"];

    // Log return request with full details
    console.log("VNPay Return Request:", {
      method: req.method,
      orderId,
      responseCode,
      amount: vnp_Params["vnp_Amount"],
      bankCode: vnp_Params["vnp_BankCode"],
      transactionNo: vnp_Params["vnp_TransactionNo"],
      allParams: vnp_Params,
    });

    // Log return request
    vnpayLogger.log("INFO", "VNPay return received", {
      orderId,
      responseCode,
      amount: vnp_Params["vnp_Amount"],
      bankCode: vnp_Params["vnp_BankCode"],
      transactionNo: vnp_Params["vnp_TransactionNo"],
    });

    // Verify signature
    if (!vnpayConfig.verifySignature({ ...vnp_Params })) {
      vnpayLogger.logSecurityEvent("Invalid signature in return", {
        orderId,
        ip: req.ip,
      });
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/failed?error=invalid_signature`
      );
    }

    // Find payment record
    const order = await Payment.findOne({
      where: { orderId: orderId },
    });

    if (!order) {
      vnpayLogger.logError("process_return", new Error("Order not found"), {
        orderId,
      });
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/failed?error=order_not_found`
      );
    }

    // Parse order info to get userId and subscriptionId
    const orderInfoParsed = vnpayConfig.parseOrderInfo(
      vnp_Params["vnp_OrderInfo"]
    );

    if (!orderInfoParsed.isValid) {
      vnpayLogger.logError("process_return", new Error("Invalid order info"), {
        orderId,
        orderInfo: vnp_Params["vnp_OrderInfo"],
      });
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/failed?error=invalid_order_info`
      );
    }

    const { userId, subscriptionId } = orderInfoParsed;

    // Determine redirect URL based on response code
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (responseCode === "00") {
      // Payment successful - Process subscription update
      try {
        // Update payment record
        const paymentDate = new Date(
          vnp_Params["vnp_PayDate"].slice(0, 4), // Năm
          vnp_Params["vnp_PayDate"].slice(4, 6) - 1, // Tháng (trừ 1)
          vnp_Params["vnp_PayDate"].slice(6, 8), // Ngày
          vnp_Params["vnp_PayDate"].slice(8, 10), // Giờ
          vnp_Params["vnp_PayDate"].slice(10, 12), // Phút
          vnp_Params["vnp_PayDate"].slice(12, 14) // Giây
        );

        await order.update({
          transaction_id: vnp_Params["vnp_TransactionNo"],
          payment_status: "SUCCESS",
          payment_date: paymentDate,
          notes: `VNPay Transaction: ${orderId}`,
        });

        // Reload order để đảm bảo có dữ liệu mới nhất
        await order.reload();

        // Update coupon usage if applicable
        const couponId = order.coupon_id;
        if (couponId && couponId !== null && couponId !== undefined) {
          console.log(`Processing coupon usage for coupon_id: ${couponId}`);
          const coupon = await Coupon.findByPk(couponId);
          if (coupon) {
            console.log(
              `Coupon found: ${coupon.code}, current usage_count: ${coupon.usage_count}`
            );
            await coupon.increment("usage_count");
            await coupon.reload(); // Reload để lấy giá trị mới
            console.log(`Coupon usage_count updated to: ${coupon.usage_count}`);
          } else {
            console.log(`Coupon not found with id: ${couponId}`);
          }
        } else {
          console.log(`No coupon_id found in order: ${orderId}`);
        }

        // Get subscription and user information
        const subscription = await Subscription.findByPk(subscriptionId);
        if (!subscription) {
          throw new Error("Subscription not found");
        }

        const user = await User.findByPk(userId);
        if (!user) {
          throw new Error("User not found");
        }

        // Update user prompt count
        user.count_promt += subscription.duration;
        await user.save();

        // Update or create UserSub
        let userSub = await UserSub.findOne({
          where: { user_id: userId },
        });

        const currentDate = new Date();

        // Calculate end date based on billing cycle
        let endDate;
        switch (subscription.billing_cycle) {
          case "monthly":
            endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + 30);
            break;
          case "yearly":
            endDate = new Date(currentDate);
            endDate.setFullYear(endDate.getFullYear() + 1);
            break;
          case "token":
          case "lifetime":
            endDate = new Date(currentDate);
            endDate.setFullYear(endDate.getFullYear() + 30);
            break;
          default:
            endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + 30);
        }

        // ✅ Enforce single userSub rule: DELETE existing userSubs before creating/updating
        await UserSub.destroy({
          where: { user_id: userId },
        });

        // Create new UserSub with purchased subscription
        await UserSub.create({
          user_id: userId,
          sub_id: subscription.id,
          status: 1,
          start_date: currentDate,
          end_date: endDate,
          token: subscription.duration || 0,
        });

        console.log(
          `UserSub created/updated for user ${userId} with subscription ${subscription.name_sub}`
        );

        // Log successful payment processing
        vnpayLogger.logPaymentResult(orderId, "SUCCESS", {
          userId,
          subscriptionId,
          amount: order.amount,
          transactionId: vnp_Params["vnp_TransactionNo"],
          subscriptionName: subscription.name_sub,
        });

        // Send Skool invite email only for subscription ID 12
        if (subscriptionId === 12) {
          try {
            const emailResult = await sendSkoolInviteEmail(
              user.email,
              user.full_name || user.email,
              subscription.name_sub,
              orderId
            );

            if (emailResult.success) {
              vnpayLogger.log("INFO", "Skool invite email sent successfully", {
                orderId,
                userId,
                email: user.email,
                messageId: emailResult.messageId,
              });
            } else {
              vnpayLogger.logError(
                "send_skool_email",
                new Error(emailResult.error),
                {
                  orderId,
                  userId,
                  email: user.email,
                }
              );
            }
          } catch (emailError) {
            vnpayLogger.logError("send_skool_email", emailError, {
              orderId,
              userId,
              email: user.email,
            });
          }
        }

        // Handle response based on request method
        if (req.method === "POST") {
          // Return JSON response for POST requests (frontend callback)
          return res.json({
            success: true,
            orderId,
            amount: Math.round(vnp_Params["vnp_Amount"] / 100),
            transactionNo: vnp_Params["vnp_TransactionNo"],
            bankCode: vnp_Params["vnp_BankCode"] || "",
            payDate: vnp_Params["vnp_PayDate"] || "",
            subscriptionId,
            subscriptionName: subscription.name_sub,
            message: "Payment processed successfully",
          });
        } else {
          // Redirect for GET requests (direct VNPay callback)
          const redirectUrl =
            `${frontendUrl}/payment/success?` +
            `orderId=${orderId}&` +
            `amount=${Math.round(vnp_Params["vnp_Amount"] / 100)}&` +
            `transactionNo=${vnp_Params["vnp_TransactionNo"]}&` +
            `bankCode=${vnp_Params["vnp_BankCode"] || ""}&` +
            `payDate=${vnp_Params["vnp_PayDate"] || ""}&` +
            `subscriptionId=${subscriptionId}&` +
            `subscriptionName=${encodeURIComponent(subscription.name_sub)}`;

          vnpayLogger.log("INFO", "Redirecting to success page", {
            orderId,
            redirectUrl,
          });
          return res.redirect(redirectUrl);
        }
      } catch (error) {
        vnpayLogger.logError("process_successful_payment_return", error, {
          orderId,
          userId,
          subscriptionId,
        });

        if (req.method === "POST") {
          return res.json({
            success: false,
            error: "subscription_update_failed",
            message: "Error processing payment",
          });
        } else {
          return res.redirect(
            `${frontendUrl}/payment/failed?error=subscription_update_failed`
          );
        }
      }
    } else {
      // Payment failed
      if (req.method === "POST") {
        return res.json({
          success: false,
          orderId,
          errorCode: responseCode,
          message: getErrorMessage(responseCode),
        });
      } else {
        const redirectUrl =
          `${frontendUrl}/payment/failed?` +
          `orderId=${orderId}&` +
          `errorCode=${responseCode}&` +
          `message=${getErrorMessage(responseCode)}`;

        vnpayLogger.log("INFO", "Redirecting to failed page", {
          orderId,
          responseCode,
          redirectUrl,
        });
        return res.redirect(redirectUrl);
      }
    }
  } catch (error) {
    vnpayLogger.logError("process_return", error, {
      orderId: req.query.vnp_TxnRef || req.body.vnp_TxnRef,
    });
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

    if (req.method === "POST") {
      return res.json({
        success: false,
        error: "server_error",
        message: "Server error processing payment",
      });
    } else {
      return res.redirect(`${frontendUrl}/payment/failed?error=server_error`);
    }
  }
});

// Helper function to get error message
function getErrorMessage(responseCode) {
  const errorMessages = {
    "07": "Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, giao dịch bất thường).",
    "09": "Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng chưa đăng ký dịch vụ InternetBanking.",
    10: "Xác thực thông tin thẻ/tài khoản không đúng quá 3 lần",
    11: "Đã hết hạn chờ thanh toán. Xin vui lòng thực hiện lại giao dịch.",
    12: "Giao dịch bị từ chối do thẻ/tài khoản của khách hàng bị khóa.",
    24: "Khách hàng hủy giao dịch",
    51: "Tài khoản không đủ số dư để thực hiện giao dịch.",
    65: "Tài khoản đã vượt quá hạn mức giao dịch trong ngày.",
    75: "Ngân hàng thanh toán đang bảo trì.",
    79: "Nhập sai mật khẩu thanh toán quá số lần quy định.",
    99: "Lỗi không xác định",
  };

  return errorMessages[responseCode] || "Giao dịch không thành công";
}

router.get("/vnpay_ipn", validateIPNIP, async function (req, res, next) {
  try {
    const vnp_Params = req.query;
    const orderId = vnp_Params["vnp_TxnRef"];
    const rspCode = vnp_Params["vnp_ResponseCode"];

    // Log incoming IPN request
    vnpayLogger.logIPNRequest(vnp_Params, orderId, rspCode);

    // Verify signature using VNPay config
    if (!vnpayConfig.verifySignature(vnp_Params)) {
      vnpayLogger.logSecurityEvent("Invalid signature", {
        orderId,
        ip: req.ip,
      });
      return res.status(200).json({
        RspCode: "97",
        Message: "Invalid Checksum",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // Find order in database
    const order = await Payment.findOne({
      where: { orderId: orderId },
    });

    if (!order) {
      console.error(`Order not found: ${orderId}`);
      return res.status(200).json({
        RspCode: "01",
        Message: "Order Not Found",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // Check amount
    const vnpAmount = parseInt(vnp_Params["vnp_Amount"]) / 100;
    const checkAmount = Math.abs(order.amount - vnpAmount) < 0.01;

    if (!checkAmount) {
      console.error(
        `Amount mismatch for order ${orderId}. Expected: ${order.amount}, Received: ${vnpAmount}`
      );
      return res.status(200).json({
        RspCode: "04",
        Message: "Invalid amount",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // Check if transaction already processed
    const existingPayment = await Payment.findOne({
      where: { transaction_id: vnp_Params["vnp_TransactionNo"] },
    });

    if (existingPayment) {
      console.log(
        `Transaction already processed: ${vnp_Params["vnp_TransactionNo"]}`
      );
      return res.status(200).json({
        RspCode: "02",
        Message: "This order has been updated to the payment status",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // Check payment status
    if (order.payment_status !== "PENDING") {
      console.log(
        `Order ${orderId} already processed with status: ${order.payment_status}`
      );
      return res.status(200).json({
        RspCode: "02",
        Message: "This order has been updated to the payment status",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // Parse order info
    const orderInfoParsed = vnpayConfig.parseOrderInfo(
      vnp_Params["vnp_OrderInfo"]
    );
    if (!orderInfoParsed.isValid) {
      console.error(
        `Invalid order info for order ${orderId}: ${vnp_Params["vnp_OrderInfo"]}`
      );
      return res.status(200).json({
        RspCode: "99",
        Message: "Invalid vnp_OrderInfo format",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    const { userId, subscriptionId } = orderInfoParsed;

    // Verify order info matches database
    if (order.user_id !== userId || order.subscription_id !== subscriptionId) {
      console.error(`Order info mismatch for order ${orderId}`);
      return res.status(200).json({
        RspCode: "99",
        Message: "Invalid user_id or subscription_id in vnp_OrderInfo",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // Update payment record
    const paymentDate = new Date(
      vnp_Params["vnp_PayDate"].slice(0, 4), // Năm
      vnp_Params["vnp_PayDate"].slice(4, 6) - 1, // Tháng (trừ 1)
      vnp_Params["vnp_PayDate"].slice(6, 8), // Ngày
      vnp_Params["vnp_PayDate"].slice(8, 10), // Giờ
      vnp_Params["vnp_PayDate"].slice(10, 12), // Phút
      vnp_Params["vnp_PayDate"].slice(12, 14) // Giây
    );

    try {
      await order.update({
        transaction_id: vnp_Params["vnp_TransactionNo"],
        payment_status: rspCode === "00" ? "SUCCESS" : "FAILED",
        payment_date: paymentDate,
        notes: `VNPay Transaction: ${orderId}`,
      });
      await order.save();
      // Reload order để đảm bảo có dữ liệu mới nhất
      await order.reload();
      console.log(`Payment record updated for order ${orderId}`);
    } catch (error) {
      console.error(
        `Error updating payment record for order ${orderId}:`,
        error
      );
    }

    // Process successful payment
    if (rspCode === "00") {
      try {
        // Update coupon usage if applicable
        const couponId = order.coupon_id;
        if (couponId && couponId !== null && couponId !== undefined) {
          console.log(`Processing coupon usage for coupon_id: ${couponId}`);
          const coupon = await Coupon.findByPk(couponId);
          if (coupon) {
            console.log(
              `Coupon found: ${coupon.code}, current usage_count: ${coupon.usage_count}`
            );
            await coupon.increment("usage_count");
            await coupon.reload(); // Reload để lấy giá trị mới
            console.log(`Coupon usage_count updated to: ${coupon.usage_count}`);
          } else {
            console.log(`Coupon not found with id: ${couponId}`);
          }
        } else {
          console.log(`No coupon_id found in order: ${orderId}`);
        }

        // Get subscription and user information
        const subscription = await Subscription.findByPk(subscriptionId);
        if (!subscription) {
          throw new Error("Subscription not found");
        }

        const user = await User.findByPk(userId);
        if (!user) {
          throw new Error("User not found");
        }

        // Update user prompt count
        user.count_promt += subscription.duration;
        await user.save();
        console.log(
          `User ${userId} prompt count updated: +${subscription.duration}`
        );

        // Update or create UserSub
        let userSub = await UserSub.findOne({
          where: { user_id: userId },
        });

        const currentDate = new Date();

        // Calculate end date based on billing cycle
        let endDate;
        switch (subscription.billing_cycle) {
          case "monthly":
            endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + 30);
            break;
          case "yearly":
            endDate = new Date(currentDate);
            endDate.setFullYear(endDate.getFullYear() + 1);
            break;
          case "token":
          case "lifetime":
            endDate = new Date(currentDate);
            endDate.setFullYear(endDate.getFullYear() + 30);
            break;
          default:
            endDate = new Date(currentDate);
            endDate.setDate(endDate.getDate() + 30);
        }

        // ✅ Enforce single userSub rule: DELETE existing userSubs before creating/updating
        await UserSub.destroy({
          where: { user_id: userId },
        });

        // Create new UserSub with purchased subscription
        await UserSub.create({
          user_id: userId,
          sub_id: subscription.id,
          status: 1,
          start_date: currentDate,
          end_date: endDate,
          token: subscription.duration || 0,
        });

        console.log(
          `UserSub created/updated for user ${userId} with subscription ${subscription.name_sub}`
        );

        // Track conversion if applicable
        if (order.click_uuid && order.offer_id) {
          await trackPermate(order, vnp_Params["vnp_TxnRef"]);
        }

        // Log successful payment processing
        vnpayLogger.logPaymentResult(orderId, "SUCCESS", {
          userId,
          subscriptionId,
          amount: order.amount,
          transactionId: vnp_Params["vnp_TransactionNo"],
          subscriptionName: subscription.name_sub,
        });

        // Send Skool invite email only for subscription ID 12
        if (subscriptionId === 12) {
          try {
            const emailResult = await sendSkoolInviteEmail(
              user.email,
              user.full_name || user.email,
              subscription.name_sub,
              orderId
            );

            if (emailResult.success) {
              vnpayLogger.log("INFO", "Skool invite email sent successfully", {
                orderId,
                userId,
                email: user.email,
                messageId: emailResult.messageId,
              });
            } else {
              vnpayLogger.logError(
                "send_skool_email",
                new Error(emailResult.error),
                {
                  orderId,
                  userId,
                  email: user.email,
                }
              );
            }
          } catch (emailError) {
            vnpayLogger.logError("send_skool_email", emailError, {
              orderId,
              userId,
              email: user.email,
            });
          }
        }

        return res.status(200).json({
          RspCode: "00",
          Message: `${subscription.name_sub} activated successfully`,
          OrderId: orderId,
          Localdate: moment().format("YYYYMMDDHHmmss"),
          Signature: null,
        });
      } catch (error) {
        vnpayLogger.logError("process_successful_payment", error, {
          orderId,
          userId,
          subscriptionId,
        });
        return res.status(200).json({
          RspCode: "99",
          Message: "Error processing payment",
          TerminalId: null,
          OrderId: null,
          Localdate: null,
          Signature: null,
        });
      }
    } else {
      vnpayLogger.logPaymentResult(orderId, "FAILED", {
        userId,
        subscriptionId,
        amount: order.amount,
        responseCode: rspCode,
      });
      return res.status(200).json({
        RspCode: "00",
        Message: "Success",
        TerminalId: null,
        OrderId: orderId,
        Localdate: moment().format("YYYYMMDDHHmmss"),
        Signature: null,
      });
    }
  } catch (error) {
    vnpayLogger.logError("process_ipn", error, {
      orderId: req.query.vnp_TxnRef,
      responseCode: req.query.vnp_ResponseCode,
    });
    return res.status(200).json({
      RspCode: "99",
      Message: "Server error",
      TerminalId: null,
      OrderId: null,
      Localdate: null,
      Signature: null,
    });
  }
});

router.post("/querydr", async function (req, res, next) {
  try {
    process.env.TZ = "Asia/Ho_Chi_Minh";

    const { orderId, transDate } = req.body;

    if (!orderId || !transDate) {
      return sendErrorResponse(
        res,
        "orderId and transDate are required",
        "VALIDATION_ERROR",
        400
      );
    }

    const ipAddr = vnpayConfig.getClientIP(req);

    // Create query data using VNPay config
    const queryData = vnpayConfig.createQueryData({
      orderId,
      transDate,
      ipAddr,
    });

    console.log(`Querying transaction ${orderId} for date ${transDate}`);

    const result = await request({
      url: vnpayConfig.apiUrl,
      method: "POST",
      json: true,
      body: queryData,
    });

    vnpayLogger.logQueryTransaction(orderId, transDate, result);
    sendDetailResponse(res, result);
  } catch (error) {
    vnpayLogger.logError("query_transaction", error, {
      orderId: req.body.orderId,
      transDate: req.body.transDate,
    });
    sendInternalErrorResponse(
      res,
      "Failed to query transaction: " + error.message
    );
  }
});

router.post("/refund", async function (req, res, next) {
  try {
    process.env.TZ = "Asia/Ho_Chi_Minh";

    const { orderId, transDate, amount, transType, user } = req.body;

    if (!orderId || !transDate || !amount || !transType || !user) {
      return sendErrorResponse(
        res,
        "orderId, transDate, amount, transType, and user are required",
        "VALIDATION_ERROR",
        400
      );
    }

    const ipAddr = vnpayConfig.getClientIP(req);

    // Create refund data using VNPay config
    const refundData = vnpayConfig.createRefundData({
      orderId,
      transDate,
      amount: parseFloat(amount),
      transType,
      user,
      ipAddr,
    });

    console.log(`Processing refund for order ${orderId}, amount: ${amount}`);

    const result = await request({
      url: vnpayConfig.apiUrl,
      method: "POST",
      json: true,
      body: refundData,
    });

    vnpayLogger.logRefundRequest(orderId, amount, user, result);
    sendDetailResponse(res, result);
  } catch (error) {
    vnpayLogger.logError("process_refund", error, {
      orderId: req.body.orderId,
      amount: req.body.amount,
      user: req.body.user,
    });
    sendInternalErrorResponse(
      res,
      "Failed to process refund: " + error.message
    );
  }
});

// GET /api/payment/logs/stats - Get VNPay log statistics
router.get("/logs/stats", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start =
      startDate || moment().subtract(7, "days").format("YYYY-MM-DD");
    const end = endDate || moment().format("YYYY-MM-DD");

    const stats = vnpayLogger.getLogStatistics(start, end);

    sendDetailResponse(res, {
      period: { start, end },
      statistics: stats,
    });
  } catch (error) {
    vnpayLogger.logError("get_log_stats", error);
    sendInternalErrorResponse(
      res,
      "Failed to get log statistics: " + error.message
    );
  }
});

// POST /api/payment/logs/clean - Clean old log files
router.post("/logs/clean", async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.body;

    vnpayLogger.cleanOldLogs(daysToKeep);

    sendDetailResponse(res, {
      message: `Cleaned logs older than ${daysToKeep} days`,
      daysToKeep,
    });
  } catch (error) {
    vnpayLogger.logError("clean_logs", error);
    sendInternalErrorResponse(res, "Failed to clean logs: " + error.message);
  }
});

// GET /api/payment/filter
router.get("/filter", async (req, res) => {
  try {
    const {
      status,
      start_date,
      end_date,
      dateFrom,
      dateTo,
      name,
      email,
      page = 1,
      limit = 10,
      code,
      subscription,
      subscriptionIds: querySubscriptionIds,
      searchTerm,
    } = req.query;
    const offset = (page - 1) * limit;

    // Xây dựng điều kiện where
    const where = {};
    if (status) where.payment_status = status;

    // Handle subscription filtering - prioritize subscriptionIds over single subscription
    if (querySubscriptionIds) {
      let ids = [];
      if (typeof querySubscriptionIds === "string") {
        // Handle comma-separated string: "1,2,3"
        ids = querySubscriptionIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else if (Array.isArray(querySubscriptionIds)) {
        // Handle array: [1,2,3]
        ids = querySubscriptionIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      }

      if (ids.length > 0) {
        where.subscription_id = { [Op.in]: ids };
      }
    } else if (subscription) {
      where.subscription_id = parseInt(subscription);
    }

    // Support both date parameter naming conventions
    const startDate = start_date || dateFrom;
    const endDate = end_date || dateTo;

    if (startDate || endDate) {
      where.payment_date = {};
      if (startDate) where.payment_date[Op.gte] = new Date(startDate);
      if (endDate) where.payment_date[Op.lte] = new Date(endDate);
    }

    // Nếu có truyền code, tìm coupon_id
    if (code) {
      const coupon = await Coupon.findOne({ where: { code } });
      if (coupon) {
        where.coupon_id = coupon.id;
      } else {
        // Không tìm thấy coupon, trả về rỗng luôn
        return sendListResponse(res, [], {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 0,
        });
      }
    }

    // Join với User để filter theo tn hoặc email
    const include = [];
    if (name || email) {
      const userWhere = {};
      if (name) userWhere.full_name = { [Op.like]: `%${name}%` };
      if (email) userWhere.email = { [Op.like]: `%${email}%` };
      include.push({
        model: User,
        attributes: ["id", "full_name", "email"],
        where: userWhere,
      });
    } else {
      include.push({
        model: User,
        attributes: ["id", "full_name", "email"],
      });
    }

    // If searchTerm is provided, search across multiple fields using OR
    if (searchTerm) {
      where[Op.or] = [
        { transaction_id: { [Op.like]: `%${searchTerm}%` } },
        { orderId: { [Op.like]: `%${searchTerm}%` } },
        { notes: { [Op.like]: `%${searchTerm}%` } },
        // Search in User fields using subquery
        sequelize.literal(`EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = Payment.user_id 
          AND (users.full_name LIKE ${sequelize.escape(
            `%${searchTerm}%`
          )} OR users.email LIKE ${sequelize.escape(`%${searchTerm}%`)})
        )`),
      ];
    }

    // Get total count without includes to avoid JOIN counting issues
    const totalCount = await Payment.count({ where });

    // Get actual data with includes
    const rows = await Payment.findAll({
      where,
      include,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["payment_date", "DESC"]],
    });
    // Lấy tất cả coupon_id duy nhất từ kết quả
    const couponIds = [
      ...new Set(rows.map((p) => p.coupon_id).filter(Boolean)),
    ];
    // Lấy thông tin coupon cho các coupon_id này
    const coupons = await Coupon.findAll({
      where: { id: couponIds },
    });
    // Map coupon_id -> coupon data (ép key về string)
    const couponMap = {};
    coupons.forEach((c) => {
      couponMap[String(c.id)] = c;
    });

    // Lấy tất cả subscription_id duy nhất từ kết quả
    const subscriptionIds = [
      ...new Set(rows.map((p) => p.subscription_id).filter(Boolean)),
    ];
    const subscriptions = await Subscription.findAll({
      where: { id: subscriptionIds },
    });
    const subscriptionMap = {};
    subscriptions.forEach((s) => {
      subscriptionMap[String(s.id)] = s;
    });

    // Gắn data coupon và price vào từng payment và chỉ trả về các trường cần thiết
    const result = rows.map((payment) => {
      const p = payment.toJSON();
      const coupon = p.coupon_id
        ? couponMap[String(p.coupon_id)]
          ? couponMap[String(p.coupon_id)].toJSON()
          : null
        : null;
      const subscription = p.subscription_id
        ? subscriptionMap[String(p.subscription_id)]
        : null;
      return {
        id: p.id,
        subscriptionId: p.subscription_id,
        price: subscription ? subscription.price : null,
        amount: p.amount,
        paymentMethod: p.payment_method,
        transactionId: p.transaction_id,
        paymentStatus: p.payment_status,
        paymentDate: p.payment_date,
        user: p.User
          ? {
              id: p.User.id,
              fullName: p.User.full_name,
              email: p.User.email,
            }
          : null,
        coupon: coupon
          ? {
              id: coupon.id,
              code: coupon.code,
              discount: coupon.discount,
              type: coupon.type,
              expiryDate: coupon.expiry_date,
              isActive: coupon.is_active,
              createdAt: coupon.created_at,
            }
          : null,
      };
    });

    sendListResponse(res, transformToCamelCase(result), {
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (error) {
    sendInternalErrorResponse(res, "Lỗi khi filter payment: " + error.message);
  }
});

// GET /api/payment/export
router.get("/export", async (req, res) => {
  try {
    const {
      status,
      start_date,
      end_date,
      dateFrom,
      dateTo,
      name,
      email,
      code,
      subscription,
      subscriptionIds: querySubscriptionIds,
      searchTerm,
    } = req.query;

    // Xây dựng điều kiện where (tương tự như API filter)
    const where = {};
    if (status) where.payment_status = status;

    // Handle subscription filtering - prioritize subscriptionIds over single subscription
    if (querySubscriptionIds) {
      let ids = [];
      if (typeof querySubscriptionIds === "string") {
        // Handle comma-separated string: "1,2,3"
        ids = querySubscriptionIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else if (Array.isArray(querySubscriptionIds)) {
        // Handle array: [1,2,3]
        ids = querySubscriptionIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      }

      if (ids.length > 0) {
        where.subscription_id = { [Op.in]: ids };
      }
    } else if (subscription) {
      where.subscription_id = parseInt(subscription);
    }

    // Support both date parameter naming conventions
    const startDate = start_date || dateFrom;
    const endDate = end_date || dateTo;

    if (startDate || endDate) {
      where.payment_date = {};
      if (startDate) where.payment_date[Op.gte] = new Date(startDate);
      if (endDate) where.payment_date[Op.lte] = new Date(endDate);
    }

    // Nếu có truyền code, tìm coupon_id
    if (code) {
      const coupon = await Coupon.findOne({ where: { code } });
      if (coupon) {
        where.coupon_id = coupon.id;
      } else {
        // Không tìm thấy coupon, trả về file Excel rỗng
        const emptyWorkbook = XLSX.utils.book_new();
        const emptyData = [["Không có dữ liệu phù hợp với bộ lọc"]];
        const emptySheet = XLSX.utils.aoa_to_sheet(emptyData);
        XLSX.utils.book_append_sheet(emptyWorkbook, emptySheet, "Payments");

        const buffer = XLSX.write(emptyWorkbook, {
          type: "buffer",
          bookType: "xlsx",
        });
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=payments_empty.xlsx"
        );
        return res.send(buffer);
      }
    }

    // Join với User để filter theo tên hoặc email
    const include = [];
    if (name || email) {
      const userWhere = {};
      if (name) userWhere.full_name = { [Op.like]: `%${name}%` };
      if (email) userWhere.email = { [Op.like]: `%${email}%` };
      include.push({
        model: User,
        attributes: ["id", "full_name", "email"],
        where: userWhere,
      });
    } else {
      include.push({
        model: User,
        attributes: ["id", "full_name", "email"],
      });
    }

    // If searchTerm is provided, search across multiple fields using OR
    if (searchTerm) {
      where[Op.or] = [
        { transaction_id: { [Op.like]: `%${searchTerm}%` } },
        { orderId: { [Op.like]: `%${searchTerm}%` } },
        { notes: { [Op.like]: `%${searchTerm}%` } },
        // Search in User fields using subquery
        sequelize.literal(`EXISTS (
          SELECT 1 FROM users 
          WHERE users.id = Payment.user_id 
          AND (users.full_name LIKE ${sequelize.escape(
            `%${searchTerm}%`
          )} OR users.email LIKE ${sequelize.escape(`%${searchTerm}%`)})
        )`),
      ];
    }

    // Lấy tất cả dữ liệu (không phân trang)
    const payments = await Payment.findAll({
      where,
      include,
      order: [["payment_date", "DESC"]],
    });

    // Lấy tất cả coupon_id duy nhất từ kết quả
    const couponIds = [
      ...new Set(payments.map((p) => p.coupon_id).filter(Boolean)),
    ];
    const coupons = await Coupon.findAll({
      where: { id: couponIds },
    });
    const couponMap = {};
    coupons.forEach((c) => {
      couponMap[String(c.id)] = c;
    });

    // Lấy tất cả subscription_id duy nhất từ kết quả
    const subscriptionIds = [
      ...new Set(payments.map((p) => p.subscription_id).filter(Boolean)),
    ];
    const subscriptions = await Subscription.findAll({
      where: { id: subscriptionIds },
    });
    const subscriptionMap = {};
    subscriptions.forEach((s) => {
      subscriptionMap[String(s.id)] = s;
    });

    // Chuẩn bị dữ liệu cho Excel
    const excelData = [
      [
        "ID",
        "Tên người dùng",
        "Email",
        "Gói đăng ký",
        "Giá gói",
        "Số tiền thanh toán",
        "Phương thức thanh toán",
        "Mã giao dịch",
        "Trạng thái",
        "Ngày thanh toán",
        "Mã coupon",
        "Giảm giá coupon",
        "Loại coupon",
        "Ghi chú",
      ],
    ];

    payments.forEach((payment) => {
      const p = payment.toJSON();
      const coupon = p.coupon_id ? couponMap[String(p.coupon_id)] : null;
      const subscription = p.subscription_id
        ? subscriptionMap[String(p.subscription_id)]
        : null;

      excelData.push([
        p.id,
        p.User ? p.User.full_name : "",
        p.User ? p.User.email : "",
        subscription ? subscription.name_sub : "",
        subscription ? subscription.price : "",
        p.amount,
        p.payment_method,
        p.transaction_id || "",
        p.payment_status,
        p.payment_date
          ? moment(p.payment_date).format("DD/MM/YYYY HH:mm:ss")
          : "",
        coupon ? coupon.code : "",
        coupon ? coupon.discount : "",
        coupon ? coupon.type : "",
        p.notes || "",
      ]);
    });

    // Tạo workbook và worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);

    // Đặt độ rộng cột
    const colWidths = [
      { wch: 8 }, // ID
      { wch: 20 }, // Tên người dùng
      { wch: 25 }, // Email
      { wch: 20 }, // Gói đăng ký
      { wch: 12 }, // Giá gói
      { wch: 15 }, // Số tiền thanh toán
      { wch: 18 }, // Phương thức thanh toán
      { wch: 20 }, // Mã giao dịch
      { wch: 12 }, // Trạng thái
      { wch: 20 }, // Ngày thanh toán
      { wch: 15 }, // Mã coupon
      { wch: 12 }, // Giảm giá coupon
      { wch: 12 }, // Loại coupon
      { wch: 30 }, // Ghi chú
    ];
    worksheet["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, "Payments");

    // Tạo buffer và gửi file
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Tạo tên file với timestamp
    const timestamp = moment().format("YYYYMMDD_HHmmss");
    const filename = `payments_export_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Lỗi khi export Excel",
      error: error.message,
    });
  }
});

async function trackPermate(order, vnpTxnRef) {
  if (!order.click_uuid || !order.offer_id) return;
  try {
    await axios.post(
      "https://pmcloud1.com/conversions/update",
      {
        update_status: [
          {
            external_conversion_id: vnpTxnRef,
            offer_id: order.offer_id,
            event_id: 2355,
            pm_adv_id: "11458",
            click_uuid: order.click_uuid,
            api_key: "b7da56f57a5144f48e0f697ce797",
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error tracking conversion:", error);
  }
}

module.exports = router;
