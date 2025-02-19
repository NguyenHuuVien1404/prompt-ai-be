const express = require("express");
const Contact = require("../models/Contact");
const router = express.Router();
const nodemailer = require("nodemailer");

// Cấu hình nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'duong270302@gmail.com', // Thay bằng email của bạn
        pass: 'wvxs wjwk isgm xpyn'  // Thay bằng mật khẩu email của bạn
    }
});
// Lấy tất cả liên hệ
router.get("/", async (req, res) => {
    try {
        const contacts = await Contact.findAll();
        res.json(contacts);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});
router.get("/list", async (req, res) => {
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
// Tạo liên hệ mới
router.post("/", async (req, res) => {
    try {
        const { name, email, message } = req.body;
        const newContact = await Contact.create({ name, email, message });
        res.status(201).json(newContact);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});
router.put("/:id", async (req, res) => {
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

// Cập nhật trạng thái và phản hồi

module.exports = router;