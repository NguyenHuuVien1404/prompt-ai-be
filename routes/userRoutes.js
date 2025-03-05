const express = require('express');
const { User } = require('../models');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { sendOtpEmail } = require('../utils/emailService');

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
        const user = await User.findOne({ where: { email } });

        if (!user || user.otp_code !== otp || new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ error: "Invalid or expired OTP" });
        }

        // 🟢 Xóa OTP sau khi đăng nhập
        user.otp_code = null;
        await user.save();

        // 🟢 Trả về thông tin người dùng
        res.json({
            message: "Login successful",
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role
            },
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// router.post('/upload-avatar', upload.single('avatar'), (req, res) => {
//     res.json({ message: 'Upload successful', filePath: `/uploads/${req.file.filename}` });
// });
module.exports = router;
