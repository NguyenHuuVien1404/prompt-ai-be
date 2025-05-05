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

        // 1. Lấy và validate thông tin từ request
        let amount = parseFloat(req.body.amount);
        let bankCode = req.body.bankCode;
        let orderInfo = req.body.orderInfo;
        let duration = req.body.duration;

        // 2. Kiểm tra duration hợp lệ
        if (!duration || (duration !== '1' && duration !== '12')) {
            return res.status(400).json({ 
                error: 'Invalid duration. Must be either 1 (month) or 12 (year)' 
            });
        }

        // 3. Kiểm tra orderInfo format
        if (!orderInfo || !orderInfo.includes('-')) {
            return res.status(400).json({ error: 'Invalid orderInfo format' });
        }

        const [userId, subscriptionId] = orderInfo.split('-').map(Number);
        if (!userId || !subscriptionId) {
            return res.status(400).json({ error: 'Invalid user_id or subscription_id' });
        }

        // 4. Kiểm tra subscription tồn tại và có đủ thông tin
        const subscription = await Subscription.findByPk(subscriptionId);
        if (!subscription) {
            return res.status(400).json({ error: 'Subscription not found' });
        }

        // 5. Kiểm tra description và description_per_year
        if (duration === '1' && (!subscription.description || isNaN(subscription.description))) {
            return res.status(400).json({ error: 'Invalid subscription description for monthly plan' });
        }
        if (duration === '12' && (!subscription.description_per_year || isNaN(subscription.description_per_year))) {
            return res.status(400).json({ error: 'Invalid subscription description_per_year for yearly plan' });
        }

        // 6. Tạo orderId duy nhất
        let orderId = moment(date).format('DDHHmmss') + Math.floor(100000 + Math.random() * 900000);

        // 7. Lưu bản ghi tạm thời vào Payment với trạng thái PENDING
        const payment = await Payment.create({
            user_id: userId,
            subscription_id: subscriptionId,
            amount: amount,
            payment_method: bankCode || 'VNPAY',
            transaction_id: null,
            payment_status: 'PENDING',
            payment_date: new Date(),
            orderId: orderId,
            duration: duration, // Lưu duration vào payment
            notes: `VNPay Transaction: ${orderId}`,
        });

        // 8. Tạo URL thanh toán VNPay
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
        vnp_Params['vnp_Amount'] = amount * 100;
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
        
        // 9. Trả về URL thanh toán
        res.json({ 
            paymentUrl: vnpUrl,
            orderId: orderId,
            amount: amount,
            duration: duration
        });
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
        // 1. Lấy thông tin từ request
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

        // 3. Kiểm tra orderId tồn tại
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

        // 4. Kiểm tra số tiền khớp
        const vnpAmount = parseInt(vnp_Params['vnp_Amount']) / 100;
        let checkAmount = Math.abs(order.amount - vnpAmount) < 0.01;

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

        // 5. Kiểm tra giao dịch đã xử lý chưa
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

        // 6. Kiểm tra paymentStatus
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

        // 7. Kiểm tra duration hợp lệ
        if (!order.duration || (order.duration !== '1' && order.duration !== '12')) {
            console.error(`Invalid duration for order ${orderId}: ${order.duration}`);
            return res.status(200).json({
                RspCode: '99',
                Message: 'Invalid duration in payment record',
                TerminalId: null,
                OrderId: orderId,
                Localdate: moment().format('YYYYMMDDHHmmss'),
                Signature: null,
            });
        }

        // 8. Kiểm tra subscription tồn tại và có đủ thông tin
        const subscription = await Subscription.findByPk(order.subscription_id);
        if (!subscription) {
            return res.status(200).json({
                RspCode: '99',
                Message: 'Subscription not found',
                TerminalId: null,
                OrderId: orderId,
                Localdate: moment().format('YYYYMMDDHHmmss'),
                Signature: null,
            });
        }

        // 9. Kiểm tra description và description_per_year
        if (order.duration === '1' && (!subscription.description || isNaN(subscription.description))) {
            return res.status(200).json({
                RspCode: '99',
                Message: 'Invalid subscription description for monthly plan',
                TerminalId: null,
                OrderId: orderId,
                Localdate: moment().format('YYYYMMDDHHmmss'),
                Signature: null,
            });
        }
        if (order.duration === '12' && (!subscription.description_per_year || isNaN(subscription.description_per_year))) {
            return res.status(200).json({
                RspCode: '99',
                Message: 'Invalid subscription description_per_year for yearly plan',
                TerminalId: null,
                OrderId: orderId,
                Localdate: moment().format('YYYYMMDDHHmmss'),
                Signature: null,
            });
        }

        // 10. Cập nhật thông tin giao dịch
        const paymentDate = new Date(
            vnp_Params['vnp_PayDate'].slice(0, 4),
            vnp_Params['vnp_PayDate'].slice(4, 6) - 1,
            vnp_Params['vnp_PayDate'].slice(6, 8),
            vnp_Params['vnp_PayDate'].slice(8, 10),
            vnp_Params['vnp_PayDate'].slice(10, 12),
            vnp_Params['vnp_PayDate'].slice(12, 14)
        );

        await order.update({
            transaction_id: vnp_Params['vnp_TransactionNo'],
            payment_status: rspCode === '00' ? 'SUCCESS' : 'FAILED',
            payment_date: paymentDate,
            notes: `VNPay Transaction: ${orderId}`,
        });

        // 11. Xử lý khi giao dịch thành công
        if (rspCode === '00') {
            let userSub = await UserSub.findOne({
                where: {
                    user_id: order.user_id,
                    sub_id: order.subscription_id,
                },
            });

            let user = await User.findOne({
                where: {
                    id: order.user_id,
                },
            });

            const currentDate = new Date();
            let endDate = new Date(currentDate);
            endDate.setMonth(currentDate.getMonth() + 1);
            endDate.setDate(currentDate.getDate());

            if (user) {
                let promptToAdd = 0;
                if (order.duration === '1') {
                    promptToAdd = subscription.description;
                } else if (order.duration === '12') {
                    promptToAdd = subscription.description_per_year;
                }
                user.count_promt = (user.count_promt || 0) + promptToAdd;
                await user.save();
            }

            if (userSub) {
                userSub.status = 1;
                userSub.start_date = currentDate;
                userSub.end_date = endDate;
                userSub.token = subscription.duration || 0;
                await userSub.save();
            } else {
                userSub = await UserSub.create({
                    user_id: order.user_id,
                    sub_id: order.subscription_id,
                    status: 1,
                    start_date: currentDate,
                    end_date: endDate,
                    token: subscription.duration || 0,
                });
            }
        }

        // 12. Trả về kết quả
        return res.status(200).json({
            RspCode: rspCode,
            Message: rspCode === '00' ? 'Success' : 'Failed',
            TerminalId: null,
            OrderId: orderId,
            Localdate: moment().format('YYYYMMDDHHmmss'),
            Signature: null,
        });
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