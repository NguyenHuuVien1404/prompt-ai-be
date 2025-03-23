const express = require('express');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { sendOtpEmail } = require('../utils/emailService');
const UserSub = require("../models/UserSub");
const Subscription = require("../models/Subscription");
const DeviceLog = require("../models/DeviceLog");
const userAgentParser = require('useragent');
const { Sequelize } = require("sequelize");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Cấu hình Multer để lưu file vào thư mục "uploads"
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); // Lưu file vào thư mục "uploads"
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Tạo tên file duy nhất
    },
});

// Chỉ cho phép upload file ảnh (JPG, PNG, GIF, JPEG)
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        "image/jpeg",  // JPG, JPEG
        "image/png",   // PNG
        "image/gif",   // GIF
        "image/bmp",   // BMP
        "image/webp",  // WebP
        "image/tiff",  // TIFF
        "image/svg+xml", // SVG
        "image/heic",  // HEIC (High-Efficiency Image Container)
        "image/heif"   // HEIF (High-Efficiency Image File Format)
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true); // Chấp nhận file hợp lệ
    } else {
        cb(
            new Error("Invalid file type. Only common image formats (JPG, PNG, GIF, BMP, WebP, TIFF, SVG, HEIC, HEIF) are allowed."),
            false
        );
    }
};

// Multer middleware: Cho phép upload tối đa 2 ảnh (image và image_card)
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn file tối đa 5MB
});
router.use("/upload", express.static("uploads")); // Cho phép truy cập ảnh đã upload

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
        res.json({
            data: {
                user: user,
                userSub: sortedUserSubs.length > 0 ? sortedUserSubs[0] : null,
            }
        });
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
        console.log("register", req.full_name, req.email, req.password);
        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOtp();
        console.log("register-otp", otp);
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
        const freeSub = await Subscription.findOne({ where: { type: 4 }, attributes: ["id"] });
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
        console.log("error", error);
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
        console.log("login-email", email);
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
        console.log("error-login", error);
        res.status(500).json({ error: error.message });
    }
});

// 🟢 Xác thực OTP để đăng nhập
router.post("/login-verify", async (req, res) => {
    try {
        const { email, otp, ip_address } = req.body;
        const user = await User.findOne({ where: { email }, include: { model: UserSub }, nest: true });
        console.log("email", email, "otp", otp, "ip_address", ip_address);
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
        const ipAddress = ip_address || req.connection.remoteAddress;
        console.log("ip_address_user", ipAddress);  // Lấy địa chỉ IP của người dùng
        const agent = userAgentParser.parse(userAgent);  // Phân tích User-Agent để lấy thông tin thiết bị

        // Kiểm tra xem thiết bị đã đăng nhập trước đó chưa (cùng user_id và ip_address)
        const existingDevice = await DeviceLog.findOne({
            where: { user_id: user.id, ip_address: ipAddress }
        });
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

        // Tạo JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role // Thêm role vào token
            },
            process.env.JWT_SECRET || 'your_jwt_secret_key',
            { expiresIn: '24h' }
        );

        // Trả về thông tin người dùng
        res.json({
            message: "Login successful",
            token, // Thêm token vào response
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                count_prompt: user.count_promt,
                updated_at: user.updated_at,
                profile_image: user.profile_image,
                userSub: sortedUserSubs.length > 0 ? sortedUserSubs[0] : null, // Lấy userSub có type lớn nhất
            },
        });
    } catch (error) {
        console.log("error-login-verify", error);
        res.status(500).json({ error: error.message });
    }
});
// Đăng nhập bằng mật khẩu
router.post("/login-password", async (req, res) => {
    try {
        const { email, password, ip_address } = req.body;
        console.log(email, password)
        const user = await User.findOne({
            where: { email, is_verified: true },
            include: { model: UserSub },
            nest: true
        });

        if (!user) {
            return res.status(400).json({ error: "Email không hợp lệ hoặc tài khoản chưa được xác thực" });
        }

        // Kiểm tra mật khẩu
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(400).json({ error: "Mật khẩu không đúng" });
        }

        // Lấy thông tin user subscriptions
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

        // Ghi log thiết bị
        const userAgent = req.headers['user-agent'];
        const ipAddress = ip_address || req.connection.remoteAddress;
        const agent = userAgentParser.parse(userAgent);

        const existingDevice = await DeviceLog.findOne({
            where: { user_id: user.id, ip_address: ipAddress }
        });
        if (existingDevice) {
            await DeviceLog.update(
                {
                    updated_at: Sequelize.literal('CURRENT_TIMESTAMP'),
                    login_time: new Date()
                },
                { where: { id: existingDevice.id } }
            );
        } else {
            await DeviceLog.create({
                user_id: user.id,
                ip_address: ipAddress,
                os: agent.os.toString(),
                browser: agent.toAgent(),
                device: agent.device.toString(),
                login_time: new Date(),
                latitude: req.body.latitude || null,
                longitude: req.body.longitude || null,
            });
        }

        // Tạo JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET || 'your_jwt_secret_key',
            { expiresIn: '24h' }
        );

        res.json({
            message: "Đăng nhập thành công",
            token,
            user: {
                id: user.id,
                fullName: user.full_name,
                email: user.email,
                role: user.role,
                count_prompt: user.count_promt,
                updated_at: user.updated_at,
                profile_image: user.profile_image,
                userSub: sortedUserSubs.length > 0 ? sortedUserSubs[0] : null,
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

router.put('/update-info/:id', upload.fields([{ name: "profile_image" }]), async (req, res) => {
    try {
        const userId = req.params.id;
        const fullName = req.body.full_name;

        const user = await User.findByPk(userId);

        if (!user) return res.status(404).json({ message: "User not found" });

        // Update user information
        if (fullName) {
            user.full_name = fullName;
        }

        // Handle file uploads
        let imageUrl = null;
        if (req.files && req.files["profile_image"] && req.files["profile_image"].length > 0) {
            // Delete old image if it exists
            if (user.profile_image) {
                try {
                    // Extract filename from the full URL
                    const oldImageUrl = user.profile_image;
                    const oldImagePath = oldImageUrl.split('/uploads/')[1];

                    if (oldImagePath) {
                        const fullPath = path.join(__dirname, '../uploads', oldImagePath);

                        // Check if file exists before deleting
                        if (fs.existsSync(fullPath)) {
                            fs.unlinkSync(fullPath);
                        }
                    }
                } catch (deleteErr) {
                    console.error("Error deleting old image:", deleteErr);
                    // Continue with the update even if delete fails
                }
            }

            // Save new image URL
            const baseUrl = `${req.protocol}://${req.get("host")}`;
            imageUrl = `${baseUrl}/uploads/${req.files["profile_image"][0].filename}`;
            user.profile_image = imageUrl;
        }

        // Save user changes
        await user.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                id: user.id,
                full_name: user.full_name,
                profile_image: user.profile_image
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating profile", error: error.message });
    }
});

router.put('/change-password/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const currentPass = req.query.password;
        const newPassword = req.query.newPassword;
        const user = await User.findByPk(userId);

        if (!user) return res.status(404).json({ message: "Tài khoản không tồn tại" });

        // Kiểm tra mật khẩu cũ với mật khẩu đã mã hóa trong cơ sở dữ liệu
        const isMatch = await bcrypt.compare(currentPass, user.password_hash);

        if (!isMatch) {
            return res.status(200).json({ message: "Mật khẩu hiện tại không chính xác!", type: 1 }); //type = 1: sai mật khẩu
        }
        // Mã hóa mật khẩu mới
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Cập nhật mật khẩu mới vào cơ sở dữ liệu
        user.password_hash = hashedNewPassword;
        await user.save();
        res.status(200).json({
            type: 2, // OK
            message: "Cập nhật mật khẩu thành công!",
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Lỗi khi cập nhật mật khẩu", error: error.message });
    }
});

module.exports = router;
