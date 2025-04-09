/**
 * Created by CTT VNPAY
 */

let express = require('express');
let router = express.Router();
const request = require('request-promise-native');
const moment = require('moment');
const crypto = require("crypto");
const querystring = require('qs');
const cache = require('../utils/cache');

router.get('/', function (req, res, next) {
    res.render('orderlist', { title: 'Danh sách đơn hàng' })
});

router.get('/create_payment_url', function (req, res, next) {
    res.render('order', { title: 'Tạo mới đơn hàng', amount: 10000 })
});

router.get('/querydr', function (req, res, next) {
    let desc = 'truy van ket qua thanh toan';
    res.render('querydr', { title: 'Truy vấn kết quả thanh toán' })
});

router.get('/refund', function (req, res, next) {
    let desc = 'Hoan tien GD thanh toan';
    res.render('refund', { title: 'Hoàn tiền giao dịch thanh toán' })
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

        let tmnCode = process.env.vnp_TmnCode;
        let secretKey = process.env.vnp_HashSecret;
        let vnpUrl = process.env.vnp_Url;
        let returnUrl = process.env.vnp_ReturnUrl;

        let orderId = moment(date).format('DDHHmmss') + Math.floor(100000 + Math.random() * 900000);
        let amount = req.body.amount;
        let bankCode = req.body.bankCode || '';
        let orderInfo = req.body.orderInfo || 'Thanh toan don hang';
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
        let signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest("hex");
        vnp_Params['vnp_SecureHash'] = signed;
        vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });

        // Cache payment URL briefly (30 seconds) to handle quick retries
        await cache.setCache(`payment_url_${orderId}`, vnpUrl, 30);

        res.json({ paymentUrl: vnpUrl, orderId });
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

        // Try to get from cache first
        const cachedResult = await cache.getCache(`payment_result_${orderId}`);
        if (cachedResult) {
            return res.json(JSON.parse(cachedResult));
        }

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);
        let secretKey = process.env.vnp_HashSecret;
        let signData = querystring.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest("hex");

        let result = { code: '97' };  // Default to error

        if (secureHash === signed) {
            result = { code: vnp_Params['vnp_ResponseCode'] };

            // Cache the result for 1 hour - payment results are important to keep
            await cache.setCache(`payment_result_${orderId}`, JSON.stringify(result), 3600);
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

        // Check if we've already processed this IPN
        const processedIPN = await cache.getCache(`ipn_processed_${orderId}`);
        if (processedIPN) {
            return res.status(200).json({ RspCode: '02', Message: 'This order has been updated to the payment status' });
        }

        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        vnp_Params = sortObject(vnp_Params);
        let secretKey = process.env.VNP_HASHSECRET;
        let signData = querystring.stringify(vnp_Params, { encode: false });
        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(new Buffer.from(signData, 'utf-8')).digest("hex");

        let paymentStatus = '0'; // Giả sử '0' là trạng thái khởi tạo giao dịch, chưa có IPN
        let checkOrderId = true; // Mã đơn hàng "giá trị của vnp_TxnRef" VNPAY phản hồi tồn tại trong CSDL của bạn
        let checkAmount = true; // Kiểm tra số tiền "giá trị của vnp_Amout/100" trùng khớp với số tiền của đơn hàng trong CSDL của bạn

        if (secureHash === signed) { //kiểm tra checksum
            if (checkOrderId) {
                if (checkAmount) {
                    if (paymentStatus == "0") { //kiểm tra tình trạng giao dịch trước khi cập nhật tình trạng thanh toán
                        if (rspCode == "00") {
                            //thanh cong
                            //paymentStatus = '1'
                            // Ở đây cập nhật trạng thái giao dịch thanh toán thành công vào CSDL của bạn

                            // Mark as processed in cache to avoid duplicates
                            await cache.setCache(`ipn_processed_${orderId}`, 'success', 86400); // 24 hours

                            res.status(200).json({ RspCode: '00', Message: 'Success' });
                        }
                        else {
                            //that bai
                            //paymentStatus = '2'
                            // Ở đây cập nhật trạng thái giao dịch thanh toán thất bại vào CSDL của bạn

                            // Mark as processed in cache to avoid duplicates
                            await cache.setCache(`ipn_processed_${orderId}`, 'failed', 86400); // 24 hours

                            res.status(200).json({ RspCode: '00', Message: 'Success' });
                        }
                    }
                    else {
                        res.status(200).json({ RspCode: '02', Message: 'This order has been updated to the payment status' });
                    }
                }
                else {
                    res.status(200).json({ RspCode: '04', Message: 'Amount invalid' });
                }
            }
            else {
                res.status(200).json({ RspCode: '01', Message: 'Order not found' });
            }
        }
        else {
            res.status(200).json({ RspCode: '97', Message: 'Checksum failed' });
        }
    } catch (error) {
        console.error('Error processing IPN:', error);
        res.status(200).json({ RspCode: '99', Message: 'Server error' });
    }
});

router.post('/querydr', async function (req, res, next) {
    try {
        process.env.TZ = 'Asia/Ho_Chi_Minh';
        let date = new Date();

        let vnp_TxnRef = req.body.orderId;
        let vnp_TransactionDate = req.body.transDate;

        // Check cache first for recent query results
        const cacheKey = `query_${vnp_TxnRef}_${vnp_TransactionDate}`;
        const cachedResult = await cache.getCache(cacheKey);

        if (cachedResult) {
            return res.json(JSON.parse(cachedResult));
        }

        let vnp_TmnCode = process.env.vnp_TmnCode;
        let secretKey = process.env.vnp_HashSecret;
        let vnp_Api = process.env.vnp_Api;

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

        // Cache result for 5 minutes
        await cache.setCache(cacheKey, JSON.stringify(result), 300);

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

        let vnp_TmnCode = process.env.vnp_TmnCode;
        let secretKey = process.env.vnp_HashSecret;
        let vnp_Api = process.env.vnp_Api;

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

        // Invalidate cached payment result after refund
        await cache.invalidateCache(`payment_result_${vnp_TxnRef}`);

        res.json(result);
    } catch (error) {
        console.error('Error processing refund:', error);
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