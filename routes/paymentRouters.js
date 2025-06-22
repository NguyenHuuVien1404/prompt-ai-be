/**
 * Created by CTT VNPAY
 */

let express = require("express");
let router = express.Router();
const request = require("request-promise-native");
const moment = require("moment");
const crypto = require("crypto");
const querystring = require("qs");
const UserSub = require("../models/UserSub");
const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription"); // Thêm model Subscription để lấy thông tin duration, token
const User = require("../models/User");

router.get("/", function (req, res, next) {
  res.render("orderlist", { title: "Danh sách đơn hàng" });
});

router.get("/create_payment_url", function (req, res, next) {
  res.render("order", { title: "Tạo mới đơn hàng", amount: 10000 });
});

router.get("/querydr", function (req, res, next) {
  let desc = "truy van ket qua thanh toan";
  res.render("querydr", { title: "Truy vấn kết quả thanh toán" });
});

router.get("/refund", function (req, res, next) {
  let desc = "Hoan tien GD thanh toan";
  res.render("refund", { title: "Hoàn tiền giao dịch thanh toán" });
});

router.post("/create_payment_url", async function (req, res, next) {
  try {
    process.env.TZ = "Asia/Ho_Chi_Minh";

    let date = new Date();
    let createDate = moment(date).format("YYYYMMDDHHmmss");

    let ipAddr =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress;

    let tmnCode = process.env.VNP_TMNCODE;
    let secretKey = process.env.VNP_HASHSECRET;
    let vnpUrl = process.env.VNP_URL;
    let returnUrl = process.env.VNP_RETURNURL;

    // Tạo orderId (vnp_TxnRef) duy nhất
    let orderId =
      moment(date).format("DDHHmmss") +
      Math.floor(100000 + Math.random() * 900000);

    let amount = parseFloat(req.body.amount); // Số tiền từ request
    let bankCode = req.body.bankCode;
    let orderInfo = req.body.orderInfo; // Dạng userId-subscriptionId (ví dụ: "42-1")

    // Kiểm tra orderInfo hợp lệ
    if (!orderInfo || !orderInfo.includes("-")) {
      return res.status(400).json({ error: "Invalid orderInfo format" });
    }

    const [userId, subscriptionId] = orderInfo.split("-").map(Number);
    if (!userId || !subscriptionId) {
      return res
        .status(400)
        .json({ error: "Invalid user_id or subscription_id" });
    }

    // Lưu bản ghi tạm thời vào Payment với trạng thái PENDING
    const payment = await Payment.create({
      user_id: userId,
      subscription_id: subscriptionId,
      amount: amount, // Lưu dưới dạng giá trị thực (ví dụ: 190.00)
      payment_method: bankCode || "VNPAY",
      transaction_id: null, // Chưa có transaction_id
      payment_status: "PENDING",
      payment_date: new Date(),
      orderId: orderId,
      notes: `VNPay Transaction: ${orderId}`,
    });

    let locale = req.body.language || "vn";
    let currCode = "VND";
    let vnp_Params = {};
    vnp_Params["vnp_Version"] = "2.1.0";
    vnp_Params["vnp_Command"] = "pay";
    vnp_Params["vnp_TmnCode"] = tmnCode;
    vnp_Params["vnp_Locale"] = locale;
    vnp_Params["vnp_CurrCode"] = currCode;
    vnp_Params["vnp_TxnRef"] = orderId;
    vnp_Params["vnp_OrderInfo"] = orderInfo;
    vnp_Params["vnp_OrderType"] = "other";
    vnp_Params["vnp_Amount"] = amount * 100; // Nhân 100 cho VNPay
    vnp_Params["vnp_ReturnUrl"] = returnUrl;
    vnp_Params["vnp_IpAddr"] = ipAddr;
    vnp_Params["vnp_CreateDate"] = createDate;
    if (bankCode) {
      vnp_Params["vnp_BankCode"] = bankCode;
    }

    vnp_Params = sortObject(vnp_Params);

    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", secretKey);
    let signed = hmac.update(new Buffer(signData, "utf-8")).digest("hex");
    vnp_Params["vnp_SecureHash"] = signed;
    vnpUrl += "?" + querystring.stringify(vnp_Params, { encode: false });
    res.json({ paymentUrl: vnpUrl });
  } catch (error) {
    console.error("Error creating payment URL:", error);
    res.status(500).json({ error: "Failed to create payment URL" });
  }
});

router.get("/vnpay_return", async function (req, res, next) {
  try {
    let vnp_Params = req.query;
    let secureHash = vnp_Params["vnp_SecureHash"];
    let orderId = vnp_Params["vnp_TxnRef"];

    delete vnp_Params["vnp_SecureHash"];
    delete vnp_Params["vnp_SecureHashType"];

    vnp_Params = sortObject(vnp_Params);
    let secretKey = process.env.VNP_HASHSECRET;
    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", secretKey);
    let signed = hmac.update(new Buffer(signData, "utf-8")).digest("hex");

    let result = { code: "97" }; // Default to error

    if (secureHash === signed) {
      result = { code: vnp_Params["vnp_ResponseCode"] };
    }

    res.json(result);
  } catch (error) {
    console.error("Error processing payment return:", error);
    res.status(500).json({ code: "99", message: "Server error" });
  }
});

router.get("/vnpay_ipn", async function (req, res, next) {
  try {
    let vnp_Params = req.query;
    let secureHash = vnp_Params["vnp_SecureHash"];
    let orderId = vnp_Params["vnp_TxnRef"];
    let rspCode = vnp_Params["vnp_ResponseCode"];

    // 2. Xác thực SecureHash
    delete vnp_Params["vnp_SecureHash"];
    delete vnp_Params["vnp_SecureHashType"];

    vnp_Params = sortObject(vnp_Params);
    let secretKey = process.env.VNP_HASHSECRET;
    let signData = querystring.stringify(vnp_Params, { encode: false });
    let hmac = crypto.createHmac("sha512", secretKey);
    let signed = hmac.update(new Buffer(signData, "utf-8")).digest("hex");

    if (secureHash !== signed) {
      return res.status(200).json({
        RspCode: "97",
        Message: "Invalid Checksum",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // 3. Kiểm tra checkOrderId (tìm orderId trong bảng Payment)
    const order = await Payment.findOne({
      where: { orderId: orderId },
    });

    if (!order) {
      return res.status(200).json({
        RspCode: "01",
        Message: "Order Not Found",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }
    // 4. Kiểm tra checkAmount (so sánh vnp_Amount với số tiền trong Payment)
    const vnpAmount = parseInt(vnp_Params["vnp_Amount"]) / 100; // Chia 100 để lấy giá trị thực
    let checkAmount = Math.abs(order.amount - vnpAmount) < 0.01; // So sánh với độ chính xác 0.01

    if (!checkAmount) {
      return res.status(200).json({
        RspCode: "04",
        Message: "Invalid amount",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }
    // 1. Kiểm tra xem giao dịch đã được xử lý chưa (dựa vào transaction_id trong bảng Payment)
    const existingPayment = await Payment.findOne({
      where: { transaction_id: vnp_Params["vnp_TransactionNo"] },
    });

    if (existingPayment) {
      return res.status(200).json({
        RspCode: "02",
        Message: "This order has been updated to the payment status",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }
    // 5. Kiểm tra paymentStatus (dựa trên trạng thái trong Payment)
    if (order.payment_status !== "PENDING") {
      return res.status(200).json({
        RspCode: "02",
        Message: "This order has been updated to the payment status",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    console.log({
      vnp_Params,
    });

    // // 6. Trích xuất user_id và subscription_id từ vnp_OrderInfo
    const orderInfo = vnp_Params["vnp_OrderInfo"];
    if (!orderInfo || orderInfo === "undefined" || !orderInfo.includes("-")) {
      return res.status(200).json({
        RspCode: "99",
        Message: "Invalid vnp_OrderInfo format",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }
    const [userId, subscriptionId] = orderInfo.split("-").map(Number);
    if (!userId || !subscriptionId) {
      return res.status(200).json({
        RspCode: "99",
        Message: "Invalid user_id or subscription_id",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // 7. Kiểm tra tính hợp lệ của user_id và subscription_id (so với Payment)
    if (order.user_id !== userId || order.subscription_id !== subscriptionId) {
      return res.status(200).json({
        RspCode: "99",
        Message: "Invalid user_id or subscription_id in vnp_OrderInfo",
        TerminalId: null,
        OrderId: null,
        Localdate: null,
        Signature: null,
      });
    }

    // 8. Cập nhật thông tin giao dịch trong bảng Payment
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
    } catch (error) {
      console.error("Error updating payment:", error);
    }

    // 9. Cập nhật UserSub nếu giao dịch thành công
    if (rspCode === "00") {
      const currentDate = new Date();
      const subscription = await Subscription.findByPk(subscriptionId);
      if (!subscription) throw new Error("Subscription not found");

      const user = await User.findByPk(userId);
      if (!user) throw new Error("User not found");

      // Lấy UserSub hiện tại nếu có
      let userSub = await UserSub.findOne({
        where: { user_id: userId },
      });

      // Nếu là TOKEN (id = 4)
      if (subscription.id === 4 ) {
        // Chỉ cộng token, không đụng đến UserSub
        user.count_promt += subscription.duration;
        await user.save();
        return res.status(200).json({
          RspCode: "00",
          Message: "Token added successfully",
          OrderId: orderId,
          Localdate: moment().format("YYYYMMDDHHmmss"),
          Signature: null,
        });
      }

      // Nếu là PREMIUM (id = 3)
      if (subscription.id === 3) {
        // const endDate = new Date(currentDate);
        // endDate.setMonth(currentDate.getMonth() + 1);
        // endDate.setDate(currentDate.getDate());

        user.count_promt += subscription.duration;
        await user.save();

        if (userSub) {
          // Nếu đang FREE (userSub.sub_id === 1) → cập nhật lên Premium
          if (userSub.sub_id === 1) {
            userSub.sub_id = 3;
            userSub.status = 1;
            userSub.start_date = currentDate;
            userSub.end_date = endDate;
            userSub.token = subscription.duration || 0;
            await userSub.save();
          }
          // Nếu đã Premium thì không thay đổi gì cả (giữ gói, không reset thời hạn)
        }

        return res.status(200).json({
          RspCode: "00",
          Message: "Premium activated",
          OrderId: orderId,
          Localdate: moment().format("YYYYMMDDHHmmss"),
          Signature: null,
        });
      }

      // Ngược lại không hợp lệ
      return res.status(200).json({
        RspCode: "99",
        Message: "Invalid subscription type",
        OrderId: orderId,
        Localdate: moment().format("YYYYMMDDHHmmss"),
        Signature: null,
      });
    } else {
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
    console.error("Error processing IPN:", error);
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
    let date = new Date();

    let vnp_TxnRef = req.body.orderId;
    let vnp_TransactionDate = req.body.transDate;

    let vnp_TmnCode = process.env.VNP_TMNCODE;
    let secretKey = process.env.VNP_HASHSECRET;
    let vnp_Api = process.env.VNP_API;

    let vnp_RequestId = moment(date).format("HHmmss");
    let vnp_Version = "2.1.0";
    let vnp_Command = "querydr";
    let vnp_OrderInfo = "Truy van GD ma:" + vnp_TxnRef;

    let vnp_IpAddr =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress;

    let vnp_CreateDate = moment(date).format("YYYYMMDDHHmmss");

    let data =
      vnp_RequestId +
      "|" +
      vnp_Version +
      "|" +
      vnp_Command +
      "|" +
      vnp_TmnCode +
      "|" +
      vnp_TxnRef +
      "|" +
      vnp_TransactionDate +
      "|" +
      vnp_CreateDate +
      "|" +
      vnp_IpAddr +
      "|" +
      vnp_OrderInfo;

    let hmac = crypto.createHmac("sha512", secretKey);
    let vnp_SecureHash = hmac
      .update(new Buffer.from(data, "utf-8"))
      .digest("hex");

    let dataObj = {
      vnp_RequestId: vnp_RequestId,
      vnp_Version: vnp_Version,
      vnp_Command: vnp_Command,
      vnp_TmnCode: vnp_TmnCode,
      vnp_TxnRef: vnp_TxnRef,
      vnp_OrderInfo: vnp_OrderInfo,
      vnp_TransactionDate: vnp_TransactionDate,
      vnp_CreateDate: vnp_CreateDate,
      vnp_IpAddr: vnp_IpAddr,
      vnp_SecureHash: vnp_SecureHash,
    };

    let result = await request({
      url: vnp_Api,
      method: "POST",
      json: true,
      body: dataObj,
    });

    res.json(result);
  } catch (error) {
    console.error("Error querying transaction:", error);
    res.status(500).json({ error: "Failed to query transaction" });
  }
});

router.post("/refund", async function (req, res, next) {
  try {
    process.env.TZ = "Asia/Ho_Chi_Minh";
    let date = new Date();

    let vnp_TmnCode = process.env.VNP_TMNCODE;
    let secretKey = process.env.VNP_HASHSECRET;
    let vnp_Api = process.env.VNP_API;

    let vnp_TxnRef = req.body.orderId;
    let vnp_TransactionDate = req.body.transDate;
    let vnp_Amount = req.body.amount * 100;
    let vnp_TransactionType = req.body.transType;
    let vnp_CreateBy = req.body.user;

    let vnp_RequestId = moment(date).format("HHmmss");
    let vnp_Version = "2.1.0";
    let vnp_Command = "refund";
    let vnp_OrderInfo = "Hoan tien GD ma:" + vnp_TxnRef;

    let vnp_IpAddr =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress;

    let vnp_CreateDate = moment(date).format("YYYYMMDDHHmmss");
    let vnp_TransactionNo = "0";

    let data =
      vnp_RequestId +
      "|" +
      vnp_Version +
      "|" +
      vnp_Command +
      "|" +
      vnp_TmnCode +
      "|" +
      vnp_TransactionType +
      "|" +
      vnp_TxnRef +
      "|" +
      vnp_Amount +
      "|" +
      vnp_TransactionNo +
      "|" +
      vnp_TransactionDate +
      "|" +
      vnp_CreateBy +
      "|" +
      vnp_CreateDate +
      "|" +
      vnp_IpAddr +
      "|" +
      vnp_OrderInfo;
    let hmac = crypto.createHmac("sha512", secretKey);
    let vnp_SecureHash = hmac
      .update(new Buffer.from(data, "utf-8"))
      .digest("hex");

    let dataObj = {
      vnp_RequestId: vnp_RequestId,
      vnp_Version: vnp_Version,
      vnp_Command: vnp_Command,
      vnp_TmnCode: vnp_TmnCode,
      vnp_TransactionType: vnp_TransactionType,
      vnp_TxnRef: vnp_TxnRef,
      vnp_Amount: vnp_Amount,
      vnp_TransactionNo: vnp_TransactionNo,
      vnp_CreateBy: vnp_CreateBy,
      vnp_OrderInfo: vnp_OrderInfo,
      vnp_TransactionDate: vnp_TransactionDate,
      vnp_CreateDate: vnp_CreateDate,
      vnp_IpAddr: vnp_IpAddr,
      vnp_SecureHash: vnp_SecureHash,
    };

    let result = await request({
      url: vnp_Api,
      method: "POST",
      json: true,
      body: dataObj,
    });

    res.json(result);
  } catch (error) {
    console.error(
      "Error processing refund:",

      error
    );
    res.status(500).json({ error: "Failed to process refund" });
  }
});

function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

module.exports = router;
