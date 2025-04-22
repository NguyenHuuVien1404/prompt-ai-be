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
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { Op } = require("sequelize");
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Cấu hình Multer để lưu file vào thư mục "uploads"
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/"); // Lưu file vào thư mục "uploads"
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Tạo tên file duy nhất
    },
});
const crypto = require("crypto"); // Để tạo token ngẫu nhiên
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

// Lấy tất cả users (chuyển từ GET thành POST)
router.post('/list', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // Lấy tham số từ request body thay vì query
        let { page = 1, pageSize = 10, search, account_status, is_verified, role } = req.body;

        // Đảm bảo các tham số số nguyên không bị NaN
        page = parseInt(page) || 1; // Mặc định là 1 nếu không phải số
        pageSize = parseInt(pageSize) || 10; // Mặc định là 10 nếu không phải số

        const offset = (page - 1) * pageSize;
        const limit = pageSize;

        // Xây dựng điều kiện tìm kiếm
        const whereConditions = {};

        // Tìm kiếm theo tên hoặc email
        if (search) {
            whereConditions[Op.or] = [
                { full_name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } }
            ];
        }

        // Lọc theo trạng thái
        if (account_status !== undefined && account_status !== null) {
            const parsedStatus = parseInt(account_status);
            // Chỉ thêm nếu là số hợp lệ
            if (!isNaN(parsedStatus)) {
                whereConditions.account_status = parsedStatus;
            }
        }

        // Lọc theo tình trạng xác thực
        if (is_verified !== undefined && is_verified !== null) {
            if (typeof is_verified === 'string') {
                whereConditions.is_verified = is_verified === 'true';
            } else {
                whereConditions.is_verified = !!is_verified;
            }
        }

        // Lọc theo vai trò
        if (role !== undefined && role !== null) {
            const parsedRole = parseInt(role);
            // Chỉ thêm nếu là số hợp lệ
            if (!isNaN(parsedRole)) {
                whereConditions.role = parsedRole;
            }
        }

        // Log để debug
        console.log('POST params:', { page, pageSize, offset, limit, whereConditions });

        const { count, rows } = await User.findAndCountAll({
            attributes: { exclude: ['password_hash'] },
            where: whereConditions,
            offset,
            limit,
            order: [['created_at', 'DESC']], // Sắp xếp theo ngày tạo giảm dần
        });

        res.json({
            data: rows,
            total: count,
            currentPage: page,
            pageSize,
            totalPages: Math.ceil(count / pageSize),
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: error.message });
    }
});

// Tạo user mới
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
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
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
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
        console.log("register", full_name, email, password); // Sửa req.full_name -> full_name

        // Kiểm tra xem email đã tồn tại chưa
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Email đã được sử dụng. Vui lòng chọn email khác.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otp = generateOtp();
        console.log("register-otp", otp);

        const newUser = await User.create({
            full_name,
            email,
            password_hash: hashedPassword,
            otp_code: otp,
            otp_expires_at: new Date(Date.now() + 10 * 60 * 1000), // OTP hết hạn sau 10 phút
            account_status: 1,
            role: 1,
            count_promt: 5
        });

        // Lấy ID của subscription miễn phí
        const freeSub = await Subscription.findOne({ where: { type: 4 }, attributes: ["id"] });
        if (!freeSub) {
            return res.status(404).json({ error: 'Không có subscription miễn phí' });
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
        res.json({ message: 'Mã OTP đã được gửi đến email. Vui lòng xác thực tài khoản.' });
    } catch (error) {
        console.log("error", error);
        res.status(500).json({ error: error.message });
    }
});
// Gửi lại mã OTP
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Vui lòng cung cấp địa chỉ email' });
        }

        // Tìm user theo email
        const user = await User.findOne({ where: { email } });

        // Kiểm tra người dùng tồn tại
        if (!user) {
            return res.status(404).json({ error: 'Không tìm thấy tài khoản với email này' });
        }

        // Kiểm tra nếu tài khoản đã được xác thực
        // if (user.is_verified) {
        //     return res.status(400).json({ error: 'Tài khoản này đã được xác thực. Vui lòng đăng nhập.' });
        // }

        // Tạo mã OTP mới
        const otp = generateOtp();

        // Cập nhật OTP và thời gian hết hạn trong database
        user.otp_code = otp;
        user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 phút
        await user.save();

        // Gửi email chứa OTP
        await sendOtpEmail(email, otp);

        // Trả về thông báo thành công
        res.status(200).json({ message: 'Mã OTP đã được gửi lại đến email. Vui lòng xác thực tài khoản.' });
    } catch (error) {
        console.error('Lỗi khi gửi lại OTP:', error);
        res.status(500).json({ error: 'Đã xảy ra lỗi khi gửi lại mã OTP' });
    }
});
// Xác thực OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user || user.otp_code !== otp || new Date() > new Date(user.otp_expires_at)) {
            return res.status(400).json({ error: 'Mã OTP không hợp lệ hoặc đã hết hạn' });
        }

        user.is_verified = true;
        user.otp_code = null;
        await user.save();

        res.json({ message: 'Tài khoản đã được xác thực thành công' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Đăng nhập
router.post("/login", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(400).json({ error: "Email không tồn tại" });
        }

        // Kiểm tra mật khẩu
        // const isValidPassword = await bcrypt.compare(password, user.password_hash);
        // if (!isValidPassword) {
        //     return res.status(400).json({ error: "Mật khẩu không đúng" });
        // }

        // Kiểm tra xác thực
        if (user.is_verified) {
            // Tạo token và đăng nhập thành công
            // const token = jwt.sign(
            //     { id: user.id, email: user.email, role: user.role },
            //     process.env.JWT_SECRET,
            //     { expiresIn: '24h' }
            // );

            // return res.json({
            //     message: "Đăng nhập thành công",
            //     token,
            //     user: {
            //         id: user.id,
            //         email: user.email,
            //         full_name: user.full_name,
            //         role: user.role
            //     }
            // });
            const otp = generateOtp();
            user.otp_code = otp;
            user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
            await user.save();

            await sendOtpEmail(email, otp);

            // Trả về mã trạng thái 202 Accepted với flag requireVerification
            return res.status(200).json({
                message: "Mã OTP đã được gửi đến email của bạn.",
                // requireVerification: true,
                email: user.email
            });
        } else {
            // Tài khoản chưa xác thực - tạo OTP mới và gửi
            const otp = generateOtp();
            user.otp_code = otp;
            user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
            await user.save();

            await sendOtpEmail(email, otp);

            // Trả về mã trạng thái 202 Accepted với flag requireVerification
            return res.status(202).json({
                message: "Tài khoản chưa được xác thực. Mã OTP đã được gửi đến email của bạn.",
                requireVerification: true,
                email: user.email
            });
        }
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
            return res.status(400).json({ error: "Mã OTP không hợp lệ hoặc đã hết hạn" });
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
            { expiresIn: 60 * 60 * 24 * 30 * 6 }
        );

        // Trả về thông tin người dùng
        res.json({
            message: "Đăng nhập thành công",
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
            where: { email },
            include: { model: UserSub },
            nest: true
        });
        if (!user) {
            return res.status(400).json({ error: "Email không tồn tại, hãy tiến hành đăng ký" });
        }
        if (user.is_verified) {
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
                { expiresIn: 60 * 60 * 24 * 30 * 6 }
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
        }
        else {
            // Tài khoản chưa xác thực - tạo OTP mới và gửi
            const otp = generateOtp();
            user.otp_code = otp;
            user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000);
            await user.save();

            await sendOtpEmail(email, otp);

            // Trả về mã trạng thái 202 Accepted với flag requireVerification
            return res.status(202).json({
                message: "Tài khoản chưa được xác thực. Mã OTP đã được gửi đến email của bạn.",
                requireVerification: true,
                email: user.email
            });
        }


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
// Gửi email đặt lại mật khẩu
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });

        if (!user) {
            return res.status(400).json({ error: "Email không tồn tại" });
        }

        // Tạo mã OTP
        const otp = generateOtp();
        user.otp_code = otp;
        user.otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // Hết hạn sau 10 phút
        await user.save();

        // Gửi email chứa mã OTP
        await sendOtpEmail(email, otp);

        res.json({ message: "Yêu cầu đặt lại mật khẩu đã được gửi" });
    } catch (error) {
        console.log("error-forgot-password", error);
        res.status(500).json({ error: error.message });
    }
});
// Đặt lại mật khẩu
router.post("/reset-password", async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body; // Thay token bằng otp
        const user = await User.findOne({ where: { email } });
        console.log("hiii", email, otp, newPassword)
        if (
            !user ||
            user.otp_code !== otp ||
            new Date() > new Date(user.otp_expires_at)
        ) {
            console.log("hi", new Date(), new Date(user.otp_expires_at))
            return res.status(400).json({ error: "Mã OTP không hợp lệ hoặc đã hết hạn" });
        }

        // Mã hóa mật khẩu mới
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password_hash = hashedPassword;
        user.otp_code = null; // Xóa mã OTP sau khi sử dụng
        user.otp_expires_at = null;
        await user.save();

        res.json({ message: "Đặt lại mật khẩu thành công" });
    } catch (error) {
        console.log("error-reset-password", error);
        res.status(500).json({ error: error.message });
    }
});
// Cập nhật gói đăng ký của user (Cho phép thay đổi sub_id)
router.put('/:id/subscriptions/:subId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { new_sub_id, status, start_date, end_date } = req.body;
        const userSub = await UserSub.findOne({
            where: { user_id: req.params.id, id: req.params.subId }
        });

        if (!userSub) return res.status(404).json({ message: "User subscription not found" });

        if (new_sub_id && new_sub_id !== userSub.sub_id) {
            const newSubscription = await Subscription.findByPk(new_sub_id);
            if (!newSubscription) return res.status(404).json({ message: "New subscription not found" });
            userSub.sub_id = new_sub_id;
            userSub.end_date = new Date(new Date(start_date || userSub.start_date).getTime() + newSubscription.duration * 24 * 60 * 60 * 1000);
        }
        await userSub.update({
            sub_id: new_sub_id || userSub.sub_id,
            status: status !== undefined ? status : userSub.status,
            start_date: start_date || userSub.start_date,
            end_date: end_date || userSub.end_date
        });
        await userSub.reload();
        res.json({ message: 'Subscription updated successfully', subscription: userSub });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Xem danh sách gói đăng ký của user
router.get('/:id/subscriptions', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const subscriptions = await UserSub.findAll({
            where: { user_id: req.params.id },
            include: [{ model: Subscription, attributes: ['id', 'name_sub', 'type', 'duration', 'price', 'description'] }]
        });
        res.json(subscriptions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Thêm gói đăng ký mới cho user
router.post('/:id/subscriptions', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { sub_id, start_date, end_date } = req.body;
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const subscription = await Subscription.findByPk(sub_id);
        if (!subscription) return res.status(404).json({ message: "Subscription not found" });

        const userSub = await UserSub.create({
            user_id: req.params.id,
            sub_id,
            start_date: start_date || new Date(),
            end_date: end_date || new Date(new Date().setDate(new Date().getDate() + subscription.duration)),
            status: 1
        });
        res.json({ message: 'Subscription added successfully', subscription: userSub });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Xóa gói đăng ký của user
router.delete('/:id/subscriptions/:subId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userSub = await UserSub.findOne({
            where: { user_id: req.params.id, id: req.params.subId }
        });

        if (!userSub) return res.status(404).json({ message: "User subscription not found" });

        await userSub.destroy();
        res.json({ message: 'Subscription deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Thay đổi gói đăng ký (Chuyển sang gói mới và vô hiệu hóa gói cũ)
router.patch('/:id/subscriptions/:subId/change', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { new_sub_id, start_date } = req.body;
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const currentUserSub = await UserSub.findOne({
            where: { user_id: req.params.id, id: req.params.subId }
        });
        if (!currentUserSub) return res.status(404).json({ message: "Current subscription not found" });

        const newSubscription = await Subscription.findByPk(new_sub_id);
        if (!newSubscription) return res.status(404).json({ message: "New subscription not found" });

        // Vô hiệu hóa gói hiện tại
        currentUserSub.status = 2; // 2 = Không hoạt động
        await currentUserSub.save();

        // Tạo gói mới
        const newUserSub = await UserSub.create({
            user_id: req.params.id,
            sub_id: new_sub_id,
            start_date: start_date || new Date(),
            end_date: new Date(new Date(start_date || new Date()).getTime() + newSubscription.duration * 24 * 60 * 60 * 1000),
            status: 1
        });

        res.json({ message: 'Subscription changed successfully', newSubscription: newUserSub });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post("/auth/google", async (req, res) => {
    try {
        const { credential } = req.body;
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const google_id = payload['sub'];
        const email = payload['email'];
        const name = payload['name'] || 'Unknown';
        const picture = payload['picture'];
        const user = await User.findOne({
            where: { google_id },
            include: [
                {
                    model: UserSub,
                    // alias mặc định của hasMany là: Model name + 's' => 'UserSubs'
                    // nhưng nếu viết sai như 'userSub' hoặc 'userSubs' thì sẽ lỗi
                    include: [
                        {
                            model: Subscription,
                            // alias mặc định là 'Subscription'
                        }
                    ]
                }
            ]
        });

        if (!user) {
            user = await User.findOne({ where: { email } });
            if (user) {
                user.google_id = google_id;
                user.profile_image = picture;
                await user.save();
            } else {
                user = await User.create({
                    google_id: google_id,
                    email,
                    full_name: name,
                    profile_image: picture,
                    role: 1,
                    is_verified: true,
                    count_promt: 5
                });
            }
        }

        // Tạo JWT
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role // Thêm role vào token
            },
            process.env.JWT_SECRET || 'your_jwt_secret_key',
            { expiresIn: 60 * 60 * 24 * 30 * 6 }
        );

        const firstUserSub = user?.UserSubs?.[0]; // Tên mặc định là 'UserSubs'
        const subType = firstUserSub?.Subscription;
        // Trả về response
        return res.json({
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
                userSub: {
                    subscription: subType
                }
            },
        });
    } catch (error) {
        console.error('Google login error:', error);
        return res.status(401).json({ error: 'Google login failed' });
    }
})
module.exports = router;
