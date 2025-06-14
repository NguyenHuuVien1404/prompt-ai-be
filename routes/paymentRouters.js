/**
 * Created by CTT VNPAY
 */

let express = require('express');
let router = express.Router();
const request = require('request-promise-native');
const moment = require('moment');
const crypto = require("crypto");
const querystring = require('qs');
const UserSub = require('../models/UserSub');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription'); // Thêm model Subscription để lấy thông tin duration, token
const User = require('../models/User');
const Coupon = require('../models/Coupon'); // Implied import for Coupon model
const { Op } = require('sequelize');

router.get('/', function (req, res, next) {
    res.render('orderlist', { title: 'Danh sách đơn hàng' });
});

router.get('/create_payment_url', function (req, res, next) {
    res.render('order', { title: 'Tạo mới đơn hàng', amount: 10000 });
});

router.get('/querydr', function (req, res, next) {
    let desc = 'truy van ket qua thanh toan';
    res.render('querydr', { title: 'Truy vấn kết quả thanh toán' });
});

router.get('/refund', function (req, res, next) {
    let desc = 'Hoan tien GD thanh toan';
    res.render('refund', { title: 'Hoàn tiền giao dịch thanh toán' });
});

router.post('/create_payment_url', async function (req, res, next) {
    try {
        process.env.TZ = 'Asia/Ho_Chi_Minh';

        let date = new Date();
        let createDate = moment(date).format('YYYYMMDDHHmmss');

        let ipAddr = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;

        let tmnCode = process.env.VNP_TMNCODE;
        let secretKey = process.env.VNP_HASHSECRET;
        let vnpUrl = process.env.VNP_URL;
        let returnUrl = process.env.VNP_RETURNURL;

        // Tạo orderId (vnp_TxnRef) duy nhất
        let orderId = moment(date).format('DDHHmmss') + Math.floor(100000 + Math.random() * 900000);

        let amount = parseFloat(req.body.amount); // Số tiền từ request
        let bankCode = req.body.bankCode;
        let orderInfo = req.body.orderInfo; // Dạng userId-subscriptionId (ví dụ: "42-1")
        const duration = req.body.duration; // Thời gian sử dụng (nếu cần thiết)
        const couponId = req.body.couponId; // Thêm couponId từ request

        // Kiểm tra orderInfo hợp lệ
        if (!orderInfo || !orderInfo.includes('-')) {
            return res.status(400).json({ error: 'Invalid orderInfo format' });
        }

        const [userId, subscriptionId] = orderInfo.split('-').map(Number);
        if (!userId || !subscriptionId) {
            return res.status(400).json({ error: 'Invalid user_id or subscription_id' });
        }

        // Lưu bản ghi tạm thời vào Payment với trạng thái PENDING
        const payment = await Payment.create({
            user_id: userId,
            subscription_id: subscriptionId,
            amount: amount,
            payment_method: bankCode || 'VNPAY',
            transaction_id: null,
            payment_status: 'PENDING',
            payment_date: new Date(),
            duration: duration,
            orderId: orderId,
            coupon_id: couponId,
            notes: `VNPay Transaction: ${orderId}`,
        });

        let locale = req.body.language || 'vn';
        let currCode = 'VND';
        let vnp_Params = {};
        vnp_Params['vnp_Version'] = '2.1.0';
        vnp_Params['vnp_Command'] = 'pay';
        vnp_Params['vnp_TmnCode'] = tmnCode;
        vnp_Params['vnp_Locale'] = locale;
        vnp_Params['vnp_CurrCode'] = currCode;
        vnp_Params['vnp_TxnRef'] = orderId;
        vnp_Params['vnp_OrderInfo'] = orderInfo;
        vnp_Params['vnp_OrderType'] = 'other';
        vnp_Params['vnp_Amount'] = amount * 100; // Nhân 100 cho VNPay
        vnp_Params['vnp_ReturnUrl'] = returnUrl;
        vnp_Params['vnp_IpAddr'] = ipAddr;
        vnp_Params['vnp_CreateDate'] = createDate;
        if (bankCode) {
            vnp_Params['vnp_BankCode'] = bankCode;
        }

        vnp_Params = sortObject(vnp_Params);

        let signData = querystring.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex")
        vnp_Params['vnp_SecureHash'] = signed;
        vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });
        res.json({ paymentUrl: vnpUrl });
    } catch (error) {
        console.error('Error creating payment URL:', error);
        res.status(500).json({ error: 'Failed to create payment URL' });
    }
});

router.get('/vnpay_return', async function (req, res, next) {
    try {
        let vnp_Params = req.query;
        let secureHash = vnp_Params['vnp_SecureHash'];
        let orderId = vnp_Params['vnp_TxnRef'];

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);
        let secretKey = process.env.VNP_HASHSECRET;
        let signData = querystring.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex")

        let result = { code: '97' };  // Default to error

        if (secureHash === signed) {
            result = { code: vnp_Params['vnp_ResponseCode'] };
        }

        res.json(result);
    } catch (error) {
        console.error('Error processing payment return:', error);
        res.status(500).json({ code: '99', message: 'Server error' });
    }
});

router.get('/vnpay_ipn', async function (req, res, next) {
    try {
        let vnp_Params = req.query;
        let secureHash = vnp_Params['vnp_SecureHash'];
        let orderId = vnp_Params['vnp_TxnRef'];
        let rspCode = vnp_Params['vnp_ResponseCode'];


        // 2. Xác thực SecureHash
        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);
        let secretKey = process.env.VNP_HASHSECRET;
        let signData = querystring.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac('sha512', secretKey);
        let signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");

        if (secureHash !== signed) {
            return res.status(200).json({
                RspCode: '97',
                Message: 'Invalid Checksum',
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
                RspCode: '01',
                Message: 'Order Not Found',
                TerminalId: null,
                OrderId: null,
                Localdate: null,
                Signature: null,
            });
        }
        // 4. Kiểm tra checkAmount (so sánh vnp_Amount với số tiền trong Payment)
        const vnpAmount = parseInt(vnp_Params['vnp_Amount']) / 100; // Chia 100 để lấy giá trị thực
        let checkAmount = Math.abs(order.amount - vnpAmount) < 0.01; // So sánh với độ chính xác 0.01

        if (!checkAmount) {
            return res.status(200).json({
                RspCode: '04',
                Message: 'Invalid amount',
                TerminalId: null,
                OrderId: null,
                Localdate: null,
                Signature: null,
            });
        }
        // 1. Kiểm tra xem giao dịch đã được xử lý chưa (dựa vào transaction_id trong bảng Payment)
        const existingPayment = await Payment.findOne({
            where: { transaction_id: vnp_Params['vnp_TransactionNo'] },
        });

        if (existingPayment) {
            return res.status(200).json({
                RspCode: '02',
                Message: 'This order has been updated to the payment status',
                TerminalId: null,
                OrderId: null,
                Localdate: null,
                Signature: null,
            });
        }
        // 5. Kiểm tra paymentStatus (dựa trên trạng thái trong Payment)
        if (order.payment_status !== 'PENDING') {
            return res.status(200).json({
                RspCode: '02',
                Message: 'This order has been updated to the payment status',
                TerminalId: null,
                OrderId: null,
                Localdate: null,
                Signature: null,
            });
        }

        // 6. Trích xuất user_id và subscription_id từ vnp_OrderInfo
        const orderInfo = vnp_Params['vnp_OrderInfo'];
        if (!orderInfo || orderInfo === 'undefined' || !orderInfo.includes('-')) {
            return res.status(200).json({
                RspCode: '99',
                Message: 'Invalid vnp_OrderInfo format',
                TerminalId: null,
                OrderId: null,
                Localdate: null,
                Signature: null,
            });
        }

        const [userId, subscriptionId] = orderInfo.split('-').map(Number);
        if (!userId || !subscriptionId) {
            return res.status(200).json({
                RspCode: '99',
                Message: 'Invalid user_id or subscription_id',
                TerminalId: null,
                OrderId: null,
                Localdate: null,
                Signature: null,
            });
        }

        // 7. Kiểm tra tính hợp lệ của user_id và subscription_id (so với Payment)
        if (order.user_id !== userId || order.subscription_id !== subscriptionId) {
            return res.status(200).json({
                RspCode: '99',
                Message: 'Invalid user_id or subscription_id in vnp_OrderInfo',
                TerminalId: null,
                OrderId: null,
                Localdate: null,
                Signature: null,
            });
        }

        // 8. Cập nhật thông tin giao dịch trong bảng Payment
        const paymentDate = new Date(
            vnp_Params['vnp_PayDate'].slice(0, 4),
            vnp_Params['vnp_PayDate'].slice(4, 6) - 1,
            vnp_Params['vnp_PayDate'].slice(6, 8),
            vnp_Params['vnp_PayDate'].slice(8, 10),
            vnp_Params['vnp_PayDate'].slice(10, 12),
            vnp_Params['vnp_PayDate'].slice(12, 14)
        );

        console.log('vnp_Params:', vnp_Params);
        try {
            await order.update({
                transaction_id: vnp_Params['vnp_TransactionNo'],
                payment_status: rspCode === '00' ? 'SUCCESS' : 'FAILED',
                payment_date: paymentDate,
                notes: `VNPay Transaction: ${orderId}`,
            });
            await order.save();
        } catch (error) {
            console.error('Error updating payment:', error);
        }

        // 9. Cập nhật UserSub và Coupon nếu giao dịch thành công
        if (rspCode === '00') {
            let userSub = await UserSub.findOne({
                where: {
                    user_id: userId,
                    sub_id: subscriptionId,
                },
            });
            let user = await User.findOne({
                where: {
                    id: userId,
                },
            });
            const currentDate = new Date();
            let endDate;
            let id = subscriptionId
            const subscription = await Subscription.findByPk(id);

            if (!subscription) {
                throw new Error('Subscription not found');
            }

            // Tạo một đối tượng Date mới cho endDate
            endDate = new Date(currentDate);

            // Thay đổi tháng của endDate sang tháng tiếp theo
            endDate.setMonth(currentDate.getMonth() + 1);

            // Đặt ngày của endDate là ngày của currentDate
            endDate.setDate(currentDate.getDate());
            if (user) {
                user.count_promt = 0;
                if (order.duration === 1) {
                    user.count_promt = +subscription.description;
                } else if (order.duration === 12) {
                    user.count_promt = +subscription.description_per_year;
                }
                await user.save();
            }
            if (userSub) {
                userSub.status = 1;
                userSub.start_date = currentDate;
                userSub.end_date = endDate;
                userSub.token = subscription.duration 
                await userSub.save();
            } else {
                userSub = await UserSub.create({
                    user_id: userId,
                    sub_id: subscriptionId,
                    status: 1,
                    start_date: currentDate,
                    end_date: endDate,
                    token: subscription.duration || 0,
                });
            }

            // Tăng usage_count của coupon nếu có
            if (order.coupon_id) {
                const coupon = await Coupon.findByPk(order.coupon_id);
                if (coupon) {
                    await coupon.increment('usage_count');
                }
            }

            return res.status(200).json({
                RspCode: '00',
                Message: 'Success',
                TerminalId: null,
                OrderId: orderId,
                Localdate: moment().format('YYYYMMDDHHmmss'),
                Signature: null,
            });
        } else {
            return res.status(200).json({
                RspCode: '00',
                Message: 'Success',
                TerminalId: null,
                OrderId: orderId,
                Localdate: moment().format('YYYYMMDDHHmmss'),
                Signature: null,
            });
        }
    } catch (error) {
        console.error('Error processing IPN:', error);
        return res.status(200).json({
            RspCode: '99',
            Message: 'Server error',
            TerminalId: null,
            OrderId: null,
            Localdate: null,
            Signature: null,
        });
    }
});

router.post('/querydr', async function (req, res, next) {
    try {
        process.env.TZ = 'Asia/Ho_Chi_Minh';
        let date = new Date();

        let vnp_TxnRef = req.body.orderId;
        let vnp_TransactionDate = req.body.transDate;

        let vnp_TmnCode = process.env.VNP_TMNCODE;
        let secretKey = process.env.VNP_HASHSECRET;
        let vnp_Api = process.env.VNP_API;

        let vnp_RequestId = moment(date).format('HHmmss');
        let vnp_Version = '2.1.0';
        let vnp_Command = 'querydr';
        let vnp_OrderInfo = 'Truy van GD ma:' + vnp_TxnRef;

        let vnp_IpAddr = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;

        let vnp_CreateDate = moment(date).format('YYYYMMDDHHmmss');

        let data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TxnRef + "|" + vnp_TransactionDate + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;

        let hmac = crypto.createHmac("sha512", secretKey);
        let vnp_SecureHash = hmac.update(new Buffer.from(data, 'utf-8')).digest("hex");

        let dataObj = {
            'vnp_RequestId': vnp_RequestId,
            'vnp_Version': vnp_Version,
            'vnp_Command': vnp_Command,
            'vnp_TmnCode': vnp_TmnCode,
            'vnp_TxnRef': vnp_TxnRef,
            'vnp_OrderInfo': vnp_OrderInfo,
            'vnp_TransactionDate': vnp_TransactionDate,
            'vnp_CreateDate': vnp_CreateDate,
            'vnp_IpAddr': vnp_IpAddr,
            'vnp_SecureHash': vnp_SecureHash
        };

        let result = await request({
            url: vnp_Api,
            method: "POST",
            json: true,
            body: dataObj
        });

        res.json(result);
    } catch (error) {
        console.error('Error querying transaction:', error);
        res.status(500).json({ error: 'Failed to query transaction' });
    }
});

router.post('/refund', async function (req, res, next) {
    try {
        process.env.TZ = 'Asia/Ho_Chi_Minh';
        let date = new Date();

        let vnp_TmnCode = process.env.VNP_TMNCODE;
        let secretKey = process.env.VNP_HASHSECRET;
        let vnp_Api = process.env.VNP_API;

        let vnp_TxnRef = req.body.orderId;
        let vnp_TransactionDate = req.body.transDate;
        let vnp_Amount = req.body.amount * 100;
        let vnp_TransactionType = req.body.transType;
        let vnp_CreateBy = req.body.user;

        let vnp_RequestId = moment(date).format('HHmmss');
        let vnp_Version = '2.1.0';
        let vnp_Command = 'refund';
        let vnp_OrderInfo = 'Hoan tien GD ma:' + vnp_TxnRef;

        let vnp_IpAddr = req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;

        let vnp_CreateDate = moment(date).format('YYYYMMDDHHmmss');
        let vnp_TransactionNo = '0';

        let data = vnp_RequestId + "|" + vnp_Version + "|" + vnp_Command + "|" + vnp_TmnCode + "|" + vnp_TransactionType + "|" + vnp_TxnRef + "|" + vnp_Amount + "|" + vnp_TransactionNo + "|" + vnp_TransactionDate + "|" + vnp_CreateBy + "|" + vnp_CreateDate + "|" + vnp_IpAddr + "|" + vnp_OrderInfo;
        let hmac = crypto.createHmac("sha512", secretKey);
        let vnp_SecureHash = hmac.update(new Buffer.from(data, 'utf-8')).digest("hex");

        let dataObj = {
            'vnp_RequestId': vnp_RequestId,
            'vnp_Version': vnp_Version,
            'vnp_Command': vnp_Command,
            'vnp_TmnCode': vnp_TmnCode,
            'vnp_TransactionType': vnp_TransactionType,
            'vnp_TxnRef': vnp_TxnRef,
            'vnp_Amount': vnp_Amount,
            'vnp_TransactionNo': vnp_TransactionNo,
            'vnp_CreateBy': vnp_CreateBy,
            'vnp_OrderInfo': vnp_OrderInfo,
            'vnp_TransactionDate': vnp_TransactionDate,
            'vnp_CreateDate': vnp_CreateDate,
            'vnp_IpAddr': vnp_IpAddr,
            'vnp_SecureHash': vnp_SecureHash
        };

        let result = await request({
            url: vnp_Api,
            method: "POST",
            json: true,
            body: dataObj
        });

        res.json(result);
    } catch (error) {
        console.error('Error processing refund:',

            error);
        res.status(500).json({ error: 'Failed to process refund' });
    }
});

// GET /api/payment/filter
router.get('/filter', async (req, res) => {
    try {
        const { status, start_date, end_date, name, email, page = 1, limit = 10, code } = req.query;
        const offset = (page - 1) * limit;

        // Xây dựng điều kiện where
        const where = {};
        if (status) where.payment_status = status;
        if (start_date || end_date) {
            where.payment_date = {};
            if (start_date) where.payment_date[Op.gte] = new Date(start_date);
            if (end_date) where.payment_date[Op.lte] = new Date(end_date);
        }

        // Nếu có truyền code, tìm coupon_id
        if (code) {
            const coupon = await Coupon.findOne({ where: { code } });
            console.log("coupon",coupon);
            if (coupon) {
                where.coupon_id = coupon.id;
            } else {
                // Không tìm thấy coupon, trả về rỗng luôn
                return res.json({
                    success: true,
                    data: {
                        list: [],
                        pagination: {
                            total: 0,
                            page: parseInt(page),
                            limit: parseInt(limit),
                            totalPages: 0
                        }
                    }
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
                attributes: ['id', 'full_name', 'email'],
                where: userWhere
            });
        } else {
            include.push({
                model: User,
                attributes: ['id', 'full_name', 'email']
            });
        }

        const { count, rows } = await Payment.findAndCountAll({
            where,
            include,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['payment_date', 'DESC']]
        });
        // Lấy tất cả coupon_id duy nhất từ kết quả
        const couponIds = [...new Set(rows.map(p => p.coupon_id).filter(Boolean))];
        console.log("couponIds123123",couponIds);
        // Lấy thông tin coupon cho các coupon_id này
        const coupons = await Coupon.findAll({
            where: { id: couponIds }
        });
        console.log("coupons123123",coupons);
        // Map coupon_id -> coupon data (ép key về string)
        const couponMap = {};
        coupons.forEach(c => { couponMap[String(c.id)] = c; });

        // Lấy tất cả subscription_id duy nhất từ kết quả
        const subscriptionIds = [...new Set(rows.map(p => p.subscription_id).filter(Boolean))];
        const subscriptions = await Subscription.findAll({
            where: { id: subscriptionIds }
        });
        const subscriptionMap = {};
        subscriptions.forEach(s => { subscriptionMap[String(s.id)] = s; });

        // Gắn data coupon và price vào từng payment và chỉ trả về các trường cần thiết
        const result = rows.map(payment => {
            const p = payment.toJSON();
            const coupon = p.coupon_id ? (couponMap[String(p.coupon_id)] ? couponMap[String(p.coupon_id)].toJSON() : null) : null;
            const subscription = p.subscription_id ? subscriptionMap[String(p.subscription_id)] : null;
            return {
                id: p.id,
                subscription_id: p.subscription_id,
                price: subscription ? subscription.price : null,
                amount: p.amount,
                payment_method: p.payment_method,
                transaction_id: p.transaction_id,
                payment_status: p.payment_status,
                payment_date: p.payment_date,
                User: p.User ? {
                    id: p.User.id,
                    full_name: p.User.full_name,
                    email: p.User.email
                } : null,
                Coupon: coupon ? {
                    id: coupon.id,
                    code: coupon.code,
                    discount: coupon.discount,
                    type: coupon.type,
                    expiry_date: coupon.expiry_date,
                    is_active: coupon.is_active,
                    created_at: coupon.created_at
                } : null
            };
        });

        res.json({
            success: true,
            data: {
                list: result,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(count / limit)
                }
            }
        });
    } catch (error) {
        console.error('Lỗi khi filter payment:', error);
        res.status(500).json({ success: false, message: 'Lỗi khi filter payment', error: error.message });
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