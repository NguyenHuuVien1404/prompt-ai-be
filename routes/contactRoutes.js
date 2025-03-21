const express = require("express");
const Contact = require("../models/Contact");
const router = express.Router();
const nodemailer = require("nodemailer");
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// Cấu hình nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'duong270302@gmail.com', // Thay bằng email của bạn
        pass: 'wvxs wjwk isgm xpyn'  // Thay bằng mật khẩu email của bạn
    }
});

// Lấy tất cả liên hệ - Chỉ admin mới có quyền
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const contacts = await Contact.findAll();
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Lấy danh sách liên hệ có phân trang - Chỉ admin mới có quyền
router.get("/list", authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // Lấy page và pageSize từ query params, mặc định page = 1, pageSize = 10
        let { page = 1, pageSize = 10 } = req.query;

        // Chuyển đổi sang số nguyên
        page = parseInt(page);
        pageSize = parseInt(pageSize);

        // Tính offset để lấy dữ liệu phân trang
        const offset = (page - 1) * pageSize;
        const limit = pageSize;

        // Lấy danh sách categories với phân trang
        const { count, rows } = await Contact.findAndCountAll({
            limit,
            offset,
        });

        // Trả về dữ liệu phân trang
        res.json({
            totalItems: count,
            totalPages: Math.ceil(count / pageSize),
            currentPage: page,
            pageSize,
            data: rows,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tạo liên hệ mới - Không cần xác thực, ai cũng có thể gửi liên hệ
router.post("/", async (req, res) => {
    try {
        const { name, email, message, type, phone_number } = req.body;
        const newContact = await Contact.create({ name, email, message, type, phone_number });
        res.status(201).json(newContact);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Thêm người dùng thông báo - Không cần xác thực
router.post("/add-email", async (req, res) => {
    try {
        const { email, type, name, message, reply, status } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        // Kiểm tra xem email đã tồn tại chưa
        const existingContact = await Contact.findOne({ where: { email } });
        if (existingContact) {
            return res.status(400).json({ message: "Email already exists" });
        }

        // Tạo mới Contact với giá trị mặc định nếu không có trong request
        const newContact = await Contact.create({
            email,
            type: type ?? 2,
            name: name ?? "",
            message: message ?? "",
            reply: reply ?? "",
            status: status ?? 1,
        });

        res.status(201).json({ message: "Email added successfully", contact: newContact });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// Cập nhật trạng thái và phản hồi - Chỉ admin mới có quyền
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { reply } = req.body;
        const contact = await Contact.findByPk(req.params.id);
        if (!contact) {
            return res.status(404).json({ message: "Contact not found" });
        }
        contact.status = 2;
        contact.reply = reply;
        await contact.save();

        // Gửi email phản hồi
        const mailOptions = {
            from: 'duong270302@gmail.com',
            to: contact.email,
            subject: 'Phản hồi từ hệ thống',
            text: reply
        };

        transporter.sendMail(mailOptions, function (error, info) {
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });

        res.json(contact);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router;