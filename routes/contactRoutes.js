const express = require("express");
const Contact = require("../models/Contact");
const router = express.Router();
const XLSX = require("xlsx");
const moment = require("moment");
const { Op } = require("sequelize");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const { sendReplyEmail, sendSurveyEmail } = require("../utils/emailService");
const { User } = require("../models");
const {
  sendListResponse,
  sendDetailResponse,
  sendCreateResponse,
  sendUpdateResponse,
  sendDeleteResponse,
  sendErrorResponse,
  sendNotFoundResponse,
  sendInternalErrorResponse,
  calculatePagination,
} = require("../utils/responseUtils");

// Import transform utilities
const { transformToCamelCase } = require("../utils/transformUtils");

// Lấy tất cả liên hệ với filtering và pagination - Chỉ admin mới có quyền
router.get("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Lấy page và pageSize từ query params, mặc định page = 1, pageSize = 10
    let {
      page,
      pageIndex,
      pageSize = 10,
      status,
      statusIds: queryStatusIds,
      type,
    } = req.query;

    // Chuyển đổi sang số nguyên
    const currentPage = parseInt(page || pageIndex || 1);
    pageSize = parseInt(pageSize);

    // Tính offset để lấy dữ liệu phân trang
    const offset = (currentPage - 1) * pageSize;
    const limit = pageSize;

    // Build where clause based on filters
    const where = {};

    // Handle status filtering - prioritize statusIds over single status
    if (queryStatusIds) {
      let ids = [];
      if (typeof queryStatusIds === "string") {
        // Handle comma-separated string: "1,2"
        ids = queryStatusIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else if (Array.isArray(queryStatusIds)) {
        // Handle array: [1,2]
        ids = queryStatusIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      }

      if (ids.length > 0) {
        where.status = { [Op.in]: ids };
      }
    } else if (status !== "" && status !== undefined && status !== null) {
      // Handle string status values
      if (status === "read" || status === "answered") {
        where.status = 2; // Đã trả lời
      } else if (status === "unread" || status === "pending") {
        where.status = 1; // Chưa trả lời
      } else {
        const parsedStatus = parseInt(status);
        if (!isNaN(parsedStatus)) {
          where.status = parsedStatus;
        }
      }
    }

    // Lọc theo type nếu có
    if (type !== null && type !== undefined && type !== "") {
      where.type = parseInt(type);
    }

    // Lấy danh sách contacts với phân trang, lọc và sắp xếp
    const { count, rows } = await Contact.findAndCountAll({
      where,
      limit,
      offset,
      order: [["created_at", "DESC"]], // Sắp xếp theo created_at từ mới nhất đến cũ
    });

    // Tính toán thời gian còn lại đến deadline (24 giờ sau created_at)
    const currentTime = new Date(); // Thời gian hiện tại
    const rowsWithDeadline = rows.map((contact) => {
      const createdAt = new Date(contact.created_at);
      const deadline = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // Deadline = created_at + 24 giờ
      const timeRemaining = deadline - currentTime; // Thời gian còn lại (tính bằng milliseconds)

      // Chuyển đổi thời gian còn lại thành định dạng dễ đọc (giờ, phút, giây)
      let timeRemainingFormatted = "";
      if (timeRemaining <= 0) {
        timeRemainingFormatted = "Hết hạn";
      } else {
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor(
          (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
        );
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
    const pagination = calculatePagination(count, currentPage, pageSize);
    sendListResponse(res, transformToCamelCase(rowsWithDeadline), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy chi tiết liên hệ theo ID - Chỉ admin mới có quyền
router.get("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return sendErrorResponse(
        res,
        "Invalid contact ID",
        "VALIDATION_ERROR",
        400
      );
    }

    const contact = await Contact.findByPk(id);
    if (!contact) {
      return sendNotFoundResponse(res, "Contact not found");
    }

    sendDetailResponse(res, transformToCamelCase(contact));
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Lấy danh sách liên hệ có phân trang - Chỉ admin mới có quyền
router.get("/list", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    // Lấy page và pageSize từ query params, mặc định page = 1, pageSize = 10
    let {
      page,
      pageIndex,
      pageSize = 10,
      status,
      statusIds: queryStatusIds,
      type,
    } = req.query;

    // Chuyển đổi sang số nguyên
    const currentPage = parseInt(page || pageIndex || 1);
    pageSize = parseInt(pageSize);

    // Tính offset để lấy dữ liệu phân trang
    const offset = (currentPage - 1) * pageSize;
    const limit = pageSize;

    // Build where clause based on filters
    const where = {};

    // Handle status filtering - prioritize statusIds over single status
    if (queryStatusIds) {
      let ids = [];
      if (typeof queryStatusIds === "string") {
        // Handle comma-separated string: "1,2"
        ids = queryStatusIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else if (Array.isArray(queryStatusIds)) {
        // Handle array: [1,2]
        ids = queryStatusIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      }

      if (ids.length > 0) {
        where.status = { [Op.in]: ids };
      }
    } else if (status !== "" && status !== undefined && status !== null) {
      // Handle string status values
      if (status === "read" || status === "answered") {
        where.status = 2; // Đã trả lời
      } else if (status === "unread" || status === "pending") {
        where.status = 1; // Chưa trả lời
      } else {
        const parsedStatus = parseInt(status);
        if (!isNaN(parsedStatus)) {
          where.status = parsedStatus;
        }
      }
    }

    // Lọc theo type nếu có
    if (type !== null && type !== undefined && type !== "") {
      where.type = parseInt(type);
    }

    // Lấy danh sách contacts với phân trang, lọc và sắp xếp
    const { count, rows } = await Contact.findAndCountAll({
      where,
      limit,
      offset,
      order: [["created_at", "DESC"]], // Sắp xếp theo created_at từ mới nhất đến cũ
    });

    // Tính toán thời gian còn lại đến deadline (24 giờ sau created_at)
    const currentTime = new Date(); // Thời gian hiện tại
    const rowsWithDeadline = rows.map((contact) => {
      const createdAt = new Date(contact.created_at);
      const deadline = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // Deadline = created_at + 24 giờ
      const timeRemaining = deadline - currentTime; // Thời gian còn lại (tính bằng milliseconds)

      // Chuyển đổi thời gian còn lại thành định dạng dễ đọc (giờ, phút, giây)
      let timeRemainingFormatted = "";
      if (timeRemaining <= 0) {
        timeRemainingFormatted = "Hết hạn";
      } else {
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor(
          (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
        );
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
    const pagination = calculatePagination(count, currentPage, pageSize);
    sendListResponse(res, transformToCamelCase(rowsWithDeadline), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// GET /api/contact/export - Export Excel cho contact
router.get("/export", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, statusIds: queryStatusIds, type } = req.query;

    // Xây dựng điều kiện where (tương tự như API list)
    const where = {};

    // Handle status filtering - prioritize statusIds over single status
    if (queryStatusIds) {
      let ids = [];
      if (typeof queryStatusIds === "string") {
        // Handle comma-separated string: "1,2"
        ids = queryStatusIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
      } else if (Array.isArray(queryStatusIds)) {
        // Handle array: [1,2]
        ids = queryStatusIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id));
      }

      if (ids.length > 0) {
        where.status = { [Op.in]: ids };
      }
    } else if (status !== "" && status !== undefined && status !== null) {
      // Handle string status values
      if (status === "read" || status === "answered") {
        where.status = 2; // Đã trả lời
      } else if (status === "unread" || status === "pending") {
        where.status = 1; // Chưa trả lời
      } else {
        const parsedStatus = parseInt(status);
        if (!isNaN(parsedStatus)) {
          where.status = parsedStatus;
        }
      }
    }

    // Lọc theo type nếu có
    if (type !== null && type !== undefined && type !== "") {
      where.type = parseInt(type);
    }

    // Lấy tất cả dữ liệu (không phân trang)
    const contacts = await Contact.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    // Chuẩn bị dữ liệu cho Excel
    const excelData = [
      [
        "ID",
        "Tên",
        "Email",
        "Số điện thoại",
        "Loại",
        "Trạng thái",
        "Tin nhắn",
        "Phản hồi",
        "Ngày tạo",
        "Ngày cập nhật",
        "Thời gian còn lại",
      ],
    ];

    const currentTime = new Date();

    contacts.forEach((contact) => {
      const createdAt = new Date(contact.created_at);
      const deadline = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
      const timeRemaining = deadline - currentTime;

      // Format thời gian còn lại
      let timeRemainingFormatted = "";
      if (timeRemaining <= 0) {
        timeRemainingFormatted = "Hết hạn";
      } else {
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor(
          (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
        );
        timeRemainingFormatted = `${hours}h ${minutes}m`;
      }

      // Map status và type sang text
      const statusText = contact.status === 1 ? "Chưa trả lời" : "Đã trả lời";
      const typeText =
        contact.type === 1 ? "Hỗ trợ" : contact.type === 2 ? "Đăng ký" : "Khác";

      excelData.push([
        contact.id,
        contact.name || "",
        contact.email || "",
        contact.phone_number || "",
        typeText,
        statusText,
        contact.message || "",
        contact.reply || "",
        contact.created_at
          ? moment(contact.created_at).format("DD/MM/YYYY HH:mm:ss")
          : "",
        contact.updated_at
          ? moment(contact.updated_at).format("DD/MM/YYYY HH:mm:ss")
          : "",
        timeRemainingFormatted,
      ]);
    });

    // Tạo workbook và worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);

    // Đặt độ rộng cột
    const colWidths = [
      { wch: 8 }, // ID
      { wch: 20 }, // Tên
      { wch: 25 }, // Email
      { wch: 15 }, // Số điện thoại
      { wch: 12 }, // Loại
      { wch: 15 }, // Trạng thái
      { wch: 40 }, // Tin nhắn
      { wch: 40 }, // Phản hồi
      { wch: 20 }, // Ngày tạo
      { wch: 20 }, // Ngày cập nhật
      { wch: 15 }, // Thời gian còn lại
    ];
    worksheet["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts");

    // Tạo buffer và gửi file
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Tạo tên file với timestamp
    const timestamp = moment().format("YYYYMMDD_HHmmss");
    const filename = `contacts_export_${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    sendInternalErrorResponse(res, "Lỗi khi export Excel: " + error.message);
  }
});

// Tạo liên hệ mới - Không cần xác thực, ai cũng có thể gửi liên hệ
router.post("/", async (req, res) => {
  try {
    const { name, email, message, type, phone_number } = req.body;

    // Validation for required fields
    if (!name || !email || !message) {
      return sendErrorResponse(
        res,
        "Name, email, and message are required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendErrorResponse(
        res,
        "Invalid email format",
        "VALIDATION_ERROR",
        400
      );
    }

    const newContact = await Contact.create({
      name,
      email,
      message,
      type: type || 1, // Default to 1 if not provided
      phone_number,
      status: 1, // Default status: Chưa trả lời
    });

    sendCreateResponse(
      res,
      transformToCamelCase(newContact),
      "Contact created successfully"
    );
  } catch (error) {
    sendErrorResponse(res, error.message, "VALIDATION_ERROR", 400);
  }
});

// Thêm người dùng thông báo - Không cần xác thực
router.post("/add-email", async (req, res) => {
  try {
    const { email, type, name, message, reply, status } = req.body;

    if (!email) {
      return sendErrorResponse(
        res,
        "Email is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendErrorResponse(
        res,
        "Invalid email format",
        "VALIDATION_ERROR",
        400
      );
    }

    // Kiểm tra xem email đã tồn tại chưa
    const existingContact = await Contact.findOne({ where: { email } });
    if (existingContact) {
      return sendErrorResponse(
        res,
        "Email already exists",
        "DUPLICATE_EMAIL",
        400
      );
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

    sendCreateResponse(
      res,
      transformToCamelCase(newContact),
      "Email added successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Phản hồi liên hệ - Chỉ admin mới có quyền
router.patch(
  "/:id/reply",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reply } = req.body;

      if (!id || isNaN(id)) {
        return sendErrorResponse(
          res,
          "Invalid contact ID",
          "VALIDATION_ERROR",
          400
        );
      }

      if (!reply) {
        return sendErrorResponse(
          res,
          "Reply content is required",
          "VALIDATION_ERROR",
          400
        );
      }

      const contact = await Contact.findByPk(id);
      if (!contact) {
        return sendNotFoundResponse(res, "Contact not found");
      }

      // Gửi email phản hồi
      await sendReplyEmail(contact.email, reply);

      // Cập nhật database
      contact.status = 2; // Đã trả lời
      contact.reply = reply;
      await contact.save();

      sendUpdateResponse(
        res,
        transformToCamelCase(contact),
        "Reply sent successfully"
      );
    } catch (error) {
      sendErrorResponse(res, error.message, "REPLY_ERROR", 400);
    }
  }
);

// Cập nhật thông tin liên hệ - Chỉ admin mới có quyền
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, message, type, phone_number, status, reply } =
      req.body;

    if (!id || isNaN(id)) {
      return sendErrorResponse(
        res,
        "Invalid contact ID",
        "VALIDATION_ERROR",
        400
      );
    }

    const contact = await Contact.findByPk(id);
    if (!contact) {
      return sendNotFoundResponse(res, "Contact not found");
    }

    // Cập nhật các trường được cung cấp
    if (name !== undefined) contact.name = name;
    if (email !== undefined) {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return sendErrorResponse(
          res,
          "Invalid email format",
          "VALIDATION_ERROR",
          400
        );
      }
      contact.email = email;
    }
    if (message !== undefined) contact.message = message;
    if (type !== undefined) contact.type = parseInt(type);
    if (phone_number !== undefined) contact.phone_number = phone_number;
    if (status !== undefined) contact.status = parseInt(status);
    if (reply !== undefined) contact.reply = reply;

    await contact.save();

    sendUpdateResponse(
      res,
      transformToCamelCase(contact),
      "Contact updated successfully"
    );
  } catch (error) {
    sendErrorResponse(res, error.message, "UPDATE_ERROR", 400);
  }
});

// Gửi email theo lô với retry
const sendEmailsInBatches = async (
  emailList,
  reply,
  batchSize = 10,
  delayMs = 3000
) => {
  const failedEmails = [];
  for (let i = 0; i < emailList.length; i += batchSize) {
    const batch = emailList.slice(i, i + batchSize);
    const emailPromises = batch.map(async (email) => {
      let retries = 3; // Thử lại tối đa 3 lần
      while (retries > 0) {
        try {
          return sendSurveyEmail(email, reply); // Thành công thì thoát vòng lặp
        } catch (error) {
          retries--;
          if (retries === 0) {
            failedEmails.push(email);
          } else {
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Chờ 5 giây trước khi thử lại
          }
        }
      }
    });
    await Promise.all(emailPromises);
    if (i + batchSize < emailList.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs)); // Delay 3 giây giữa các lô
    }
  }
  return failedEmails;
};

router.post("/survey", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { reply } = req.body;

    if (!reply) {
      return sendErrorResponse(
        res,
        "Reply content is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const users = await User.findAll({ attributes: ["email"] });
    if (!users || users.length === 0) {
      return sendNotFoundResponse(res, "No users found");
    }

    const emailList = users.map((user) => user.email);

    sendEmailsInBatches(emailList, reply, 10, 3000)
      .then((failedEmails) => {
        console.log("Email sending completed. Failed emails:", failedEmails);
      })
      .catch((err) => {
        console.error("Error in email sending:", err);
      });

    sendDetailResponse(
      res,
      { totalEmails: emailList.length },
      "Email sending process started"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
router.post(
  "/survey-test",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { reply } = req.body;

      if (!reply) {
        return sendErrorResponse(
          res,
          "Reply content is required",
          "VALIDATION_ERROR",
          400
        );
      }

      // Test email list - only for testing purposes
      const emailList = ["meomeomex1@gmail.com", "quocdat.asean@gmail.com"];
      let failedEmails = [];

      // Gửi email từng user, cách nhau 1 giây
      for (let i = 0; i < emailList.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Chờ 1 giây

        try {
          await sendSurveyEmail(emailList[i], reply);
        } catch (error) {
          failedEmails.push(emailList[i]); // Lưu email bị lỗi
        }
      }

      sendDetailResponse(
        res,
        {
          totalEmails: emailList.length,
          failedEmails:
            failedEmails.length > 0 ? failedEmails : "No failed emails",
        },
        "All test emails have been processed"
      );
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);

module.exports = router;
