const express = require('express');
const { User } = require('../models');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { sendOtpEmail } = require('../utils/emailService');
const UserSub = require("../models/UserSub");
const Subscription = require("../models/Subscription");
const DeviceLog = require("../models/DeviceLog");
const userAgentParser = require('useragent');
const { Sequelize } = require("sequelize");


// Lấy tất cả users
router.get('/', async (req, res) => {
    try {
        const users = await User.findAll();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tạo user mới
router.post('/', async (req, res) => {
    try {
        const user = await User.create(req.body);
        res.status(201).json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Lấy user theo ID
router.get('/:id', async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cập nhật user
router.put('/:id', async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        await user.update(req.body);
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Xóa user
router.delete('/:id', async (req, res) => {
    try {
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        await user.destroy();
        res.json({ message: "User deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Đăng ký tài khoản
router.post('/register', async (req, res) => {
    try {
        const { full_name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOtp();

        const newUser = await User.create({
            full_name,
            email,
            password_hash: hashedPassword,
            otp_code: otp,
            otp_expires_at: new Date(Date.now() + 10 * 60 * 1000), // OTP hết hạn sau 10 phút,
            account_status: 1,
            role: 1

        });
        // Lấy ID của subscription miễn phí
        const freeSub = await Subscription.findOne({ where: { type: 1 }, attributes: ["id"] });
        console.log("freeSub", freeSub);
        if (!freeSub) {
            return res.status(404).json({ error: 'No free subscription available' });
        }

        // Tạo bản ghi mới trong bảng UserSub
        const newUserSub = await UserSub.create({
            user_id: newUser.id,
            sub_id: freeSub.id,
            status: 1,
            start_date: new Date(),
            end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        await sendOtpEmail(email, otp);
        res.json({ message: 'OTP sent to email. Please verify your account.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Xác thực OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user || user.otp_code !== otp || new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        user.is_verified = true;
        user.otp_code = null;
        await user.save();

        res.json({ message: 'Account verified successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Đăng nhập
router.post("/login", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email, is_verified: true } });

        if (!user) {
            return res.status(400).json({ error: "Invalid email or unverified account" });
        }

        const otp = generateOtp();
        user.otp_code = otp;
        user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendOtpEmail(email, otp);
        res.json({ message: "OTP sent for login verification" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🟢 Xác thực OTP để đăng nhập
router.post("/login-verify", async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ where: { email }, include: { model: UserSub }, nest: true });

        if (!user || user.otp_code !== otp || new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        // 🟢 Xóa OTP sau khi đăng nhập
        user.otp_code = null;
        //cập nhật đã xác thực
        user.is_verified = 1;
        await user.save();

        const userSubs = await user.getUserSubs({
            where: { status: 1 },
            include: [Subscription],
        });
        const sortedUserSubs = userSubs
            .map(us => ({
                status: us.status,
                start_date: us.start_date,
                end_date: us.end_date,
                subscription: us.Subscription ? {
                    name: us.Subscription.name_sub,
                    type: us.Subscription.type,
                } : null
            }))
            .sort((a, b) => b.subscription?.type - a.subscription?.type);

        // Lấy thông tin thiết bị từ yêu cầu
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip || req.connection.remoteAddress;  // Lấy địa chỉ IP của người dùng
        const agent = userAgentParser.parse(userAgent);  // Phân tích User-Agent để lấy thông tin thiết bị

        // Kiểm tra xem thiết bị đã đăng nhập trước đó chưa (cùng user_id và ip_address)
        const existingDevice = await DeviceLog.findOne({
            where: { user_id: user.id, ip_address: ipAddress }
        });
        console.log(existingDevice);
        if (existingDevice) {
            await DeviceLog.update(
                {
                    updated_at: Sequelize.literal('CURRENT_TIMESTAMP'),
                    login_time: new Date()
                },
                { where: { id: existingDevice.id } }
            );
        } else {
            // Tạo bản ghi mới nếu thiết bị chưa đăng nhập
            await DeviceLog.create({
                user_id: user.id,
                ip_address: ipAddress,
                os: agent.os.toString(),
                browser: agent.toAgent(),
                device: agent.device.toString(),
                login_time: new Date(),
                latitude: req.body.latitude || null,  // Nếu có gửi latitude từ frontend
                longitude: req.body.longitude || null,  // Nếu có gửi longitude từ frontend
            });
        }
        // Trả về thông tin người dùng
        res.json({
            message: "Login successful",
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                count_prompt: user.count_promt,
                profile_image: user.profile_image,
                userSub: sortedUserSubs.length > 0 ? sortedUserSubs[0] : null, // Lấy userSub có type lớn nhất
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Cập nhật count_promt giảm 1 cho user theo id
router.put('/count-prompt/:id', async (req, res) => {
    try {
        const userId = req.params.id;

        // Tìm người dùng theo id
        const user = await User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Kiểm tra nếu count_promt đã đạt 0, không giảm nữa
        if (user.count_promt <= 0) {
            return res.status(200).json({ message: "count_promt is min", count_prompt: 0 });
        }

        // Giảm count_promt đi 1
        user.count_promt -= 1;

        // Lưu thay đổi
        await user.save();

        res.status(200).json({
            message: "count_promt decreased successfully",
            count_promt: user.count_promt,
        });
    } catch (error) {
        res.status(500).json({ message: "Error updating count_promt", error: error.message });
    }
});

// router.post('/upload-avatar', upload.single('avatar'), (req, res) => {
//     res.json({ message: 'Upload successful', filePath: `/uploads/${req.file.filename}` });
// });

module.exports = router;
