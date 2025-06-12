const express = require("express");
const Contact = require("../models/Contact");
const router = express.Router();
const nodemailer = require("nodemailer");
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const { sendReplyEmail, sendSurveyEmail } = require('../utils/emailService');
const { User } = require('../models');
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
        let { page = 1, pageSize = 10, status, type } = req.query;

        // Chuyển đổi sang số nguyên
        page = parseInt(page);
        pageSize = parseInt(pageSize);

        // Tính offset để lấy dữ liệu phân trang
        const offset = (page - 1) * pageSize;
        const limit = pageSize;

        // Build where clause based on filters
        const where = {};

        // Lọc theo status nếu có
        if (status !== "") {
            where.status = status;
        }

        // Lọc theo type nếu có
        if (type !== null) {
            where.type = type;
        }

        // Lấy danh sách contacts với phân trang, lọc và sắp xếp
        const { count, rows } = await Contact.findAndCountAll({
            limit,
            offset,
            order: [["created_at", "DESC"]], // Sắp xếp theo created_at từ mới nhất đến cũ
        });

        // Tính toán thời gian còn lại đến deadline (24 giờ sau created_at)
        const currentTime = new Date(); // Thời gian hiện tại
        const rowsWithDeadline = rows.map(contact => {
            const createdAt = new Date(contact.created_at);
            const deadline = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // Deadline = created_at + 24 giờ
            const timeRemaining = deadline - currentTime; // Thời gian còn lại (tính bằng milliseconds)

            // Chuyển đổi thời gian còn lại thành định dạng dễ đọc (giờ, phút, giây)
            let timeRemainingFormatted = "";
            if (timeRemaining <= 0) {
                timeRemainingFormatted = "Hết hạn";
            } else {
                const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
                const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
                timeRemainingFormatted = `${hours}h ${minutes}m `;
            }

            // Trả về bản ghi với thêm trường timeRemaining
            return {
                ...contact.toJSON(), // Chuyển đổi bản ghi Sequelize thành JSON
                timeRemaining: timeRemainingFormatted, // Thêm trường timeRemaining
                deadline: deadline.toISOString(), // Thêm trường deadline (thời điểm hết hạn)
            };
        });

        // Trả về dữ liệu phân trang
        res.json({
            totalItems: count,
            totalPages: Math.ceil(count / pageSize),
            currentPage: page,
            pageSize,
            data: rowsWithDeadline, // Dữ liệu đã được bổ sung timeRemaining và deadline
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
        await sendReplyEmail(contact.email, reply);
        contact.status = 2;
        contact.reply = reply;
        await contact.save();



        res.json(contact);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

// Gửi email theo lô với retry
const sendEmailsInBatches = async (emailList, reply, batchSize = 10, delayMs = 3000) => {
    const failedEmails = [];
    for (let i = 0; i < emailList.length; i += batchSize) {
        const batch = emailList.slice(i, i + batchSize);
        const emailPromises = batch.map(async (email) => {
            let retries = 3; // Thử lại tối đa 3 lần
            while (retries > 0) {
                try {
                    await sendSurveyEmail(email, reply);
                    return; // Thành công thì thoát vòng lặp
                } catch (error) {
                    console.error(`❌ Failed to send to ${email} - Error: ${error.message}`);
                    retries--;
                    if (retries === 0) {
                        failedEmails.push(email);
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 5000)); // Chờ 5 giây trước khi thử lại
                    }
                }
            }
        });
        await Promise.all(emailPromises);
        if (i + batchSize < emailList.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs)); // Delay 3 giây giữa các lô
        }
    }
    return failedEmails;
};

router.post("/survey", async (req, res) => {
    try {
        const { reply } = req.body;

        const users = await User.findAll({ attributes: ["email"] });
        if (!users || users.length === 0) {
            return res.status(404).json({ message: "No users found" });
        }

        // const emailList = users.map(user => user.email);
       // Danh sách email của tất cả users
       const emailList = [
        "nguyenhuuvien14042002@gmail.com",
        "nguyenhuuvien2064@gmail.com",

    ];
        sendEmailsInBatches(emailList, reply, 10, 3000)
            .then(failedEmails => {
            })
            .catch(err => console.error("Error in email sending:", err));

        res.json({
            message: "Email sending process started",
            success: true,
            totalEmails: emailList.length
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});
// router.post("/survey-test", async (req, res) => {
//     try {
//         const { reply } = req.body;

//         // Lấy danh sách tất cả email từ bảng users
//         const users = await User.findAll({ attributes: ["email"] });
//         // console.log(users);
//         if (!users || users.length === 0) {
//             return res.status(404).json({ message: "No users found" });
//         }

//         // Danh sách email của tất cả users
//         const emailList = [
//             "nguyenhuuvien14042002@gmail.com",
//         ];
//         let failedEmails = [];

//         // Gửi email từng user, cách nhau 10 giây
//         for (let i = 0; i < emailList.length; i++) {
//             await new Promise(resolve => setTimeout(resolve, 1000)); // Chờ 10 giây

//             try {
//                 await sendSurveyEmail(emailList[i], reply);
//             } catch (error) {
//                 console.error(`❌ Failed to send email to: ${emailList[i]} - Error: ${error.message}`);
//                 failedEmails.push(emailList[i]); // Lưu email bị lỗi
//             }
//         }

//         res.json({
//             message: "All emails have been processed",
//             success: true,
//             failedEmails: failedEmails.length > 0 ? failedEmails : "No failed emails"
//         });
//     } catch (error) {
//         res.status(500).json({ message: "Server error", error: error.message });
//     }
// });

module.exports = router;