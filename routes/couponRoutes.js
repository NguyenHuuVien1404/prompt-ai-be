const express = require("express");
const router = express.Router();
const Coupon = require("../models/Coupon");
const { Op } = require("sequelize");
const sequelize = require("../config/database");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const Payment = require("../models/Payment");
const User = require("../models/User");
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

// Lấy danh sách tất cả coupons (có phân trang, tìm kiếm và thống kê)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      type,
      include_stats = false,
    } = req.query;
    const offset = (page - 1) * limit;

    // Xây dựng điều kiện tìm kiếm
    const where = {};
    if (search) {
      where[Op.or] = [{ code: { [Op.like]: `%${search}%` } }];
    }
    if (status) {
      where.is_active = status === "active";
    }
    if (type) {
      where.type = type;
    }

    // Nếu không cần thống kê, chỉ lấy danh sách coupons
    if (!include_stats) {
      const { count, rows: coupons } = await Coupon.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [["created_at", "DESC"]],
      });

      const pagination = calculatePagination(count, page, limit);
      return sendListResponse(res, transformToCamelCase(coupons), pagination);
    }

    // Nếu cần thống kê, lấy thông tin chi tiết

    // 1. Lấy toàn bộ coupons với điều kiện tìm kiếm
    const coupons = await Coupon.findAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
      raw: true,
    });

    // 2. Lấy payment có status = SUCCESS + coupon_id + full_name
    const successfulPayments = await Payment.findAll({
      attributes: ["coupon_id"],
      where: {
        payment_status: "SUCCESS",
        coupon_id: { [Op.not]: null },
      },
      include: [
        {
          model: User,
          attributes: ["full_name"],
        },
      ],
      raw: true,
      nest: true,
    });

    // 3. Group theo coupon_id để đếm số lần sử dụng
    const couponToCount = {};
    successfulPayments.forEach((p) => {
      const couponId = p.coupon_id;
      if (!couponId) return;
      couponToCount[couponId] = (couponToCount[couponId] || 0) + 1;
    });

    // 4. Merge vào coupons
    const formattedStats = coupons.map((c) => {
      const count = couponToCount[c.id] || 0;
      // Tính usage %
      const usage_percentage =
        c.max_usage && c.max_usage > 0
          ? Number(((c.usage_count / c.max_usage) * 100).toFixed(2))
          : null;

      return {
        ...c,
        usage_percentage,
        count,
      };
    });

    // 5. Lấy tổng số coupons cho phân trang
    const total = await Coupon.count({ where });

    const pagination = calculatePagination(total, page, limit);
    sendListResponse(res, transformToCamelCase(formattedStats), pagination);
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Lỗi khi lấy danh sách coupons: " + error.message
    );
  }
});

// Lấy chi tiết một coupon
router.get("/:id", async (req, res) => {
  try {
    const coupon = await Coupon.findByPk(req.params.id);
    if (!coupon) {
      return sendNotFoundResponse(res, "Không tìm thấy coupon");
    }

    sendDetailResponse(res, transformToCamelCase(coupon));
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Lỗi khi lấy chi tiết coupon: " + error.message
    );
  }
});

// Tạo coupon mới
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const couponData = req.body;

    // Validate dữ liệu
    if (
      !couponData.code ||
      couponData.discount === undefined ||
      couponData.discount === null ||
      !couponData.type
    ) {
      await t.rollback();
      return sendErrorResponse(
        res,
        "Thiếu thông tin bắt buộc",
        "INVALID_DATA",
        400
      );
    }

    // Kiểm tra discount không âm
    if (couponData.discount < 0) {
      await t.rollback();
      return sendErrorResponse(
        res,
        "Giá trị discount không được âm",
        "INVALID_DISCOUNT",
        400
      );
    }

    // Kiểm tra code đã tồn tại chưa
    const existingCoupon = await Coupon.findOne({
      where: { code: couponData.code },
    });

    if (existingCoupon) {
      await t.rollback();
      return sendErrorResponse(
        res,
        "Mã coupon đã tồn tại",
        "DUPLICATE_CODE",
        400
      );
    }

    // Tạo coupon mới
    const coupon = await Coupon.create(couponData, { transaction: t });
    await t.commit();

    sendCreateResponse(
      res,
      transformToCamelCase(coupon),
      "Tạo coupon thành công"
    );
  } catch (error) {
    await t.rollback();

    sendInternalErrorResponse(res, "Lỗi khi tạo coupon: " + error.message);
  }
});

// Cập nhật coupon
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const coupon = await Coupon.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!coupon) {
      await t.rollback();
      return sendNotFoundResponse(res, "Không tìm thấy coupon");
    }

    // Lưu thông tin cũ
    const oldData = { ...coupon.toJSON() };

    // Cập nhật coupon
    await coupon.update(req.body, { transaction: t });

    // Reload lại dữ liệu mới nhất từ database
    await coupon.reload({ transaction: t });
    const newData = coupon.toJSON();

    await t.commit();

    res.json({
      success: true,
      message: "Cập nhật coupon thành công",
      data: {
        id: coupon.id,
        code: coupon.code,
        old_data: oldData,
        new_data: newData,
        updated_at: new Date(),
      },
    });
  } catch (error) {
    await t.rollback();

    sendInternalErrorResponse(res, "Lỗi khi cập nhật coupon: " + error.message);
  }
});

// Xóa coupon
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const coupon = await Coupon.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!coupon) {
      await t.rollback();
      return sendNotFoundResponse(res, "Không tìm thấy coupon");
    }

    const deletedCoupon = { ...coupon.toJSON() };
    await coupon.destroy({ transaction: t });
    await t.commit();

    res.json({
      success: true,
      message: "Xóa coupon thành công",
      data: {
        id: deletedCoupon.id,
        code: deletedCoupon.code,
        deleted_at: new Date(),
      },
    });
  } catch (error) {
    await t.rollback();

    sendInternalErrorResponse(res, "Lỗi khi xóa coupon: " + error.message);
  }
});

// Kiểm tra tính hợp lệ của coupon
router.post("/validate", async (req, res) => {
  try {
    const { code, total } = req.body;

    if (!code) {
      return sendErrorResponse(
        res,
        "Vui lòng nhập mã coupon",
        "MISSING_CODE",
        400
      );
    }

    // Tìm coupon theo code
    const coupon = await Coupon.findOne({
      where: { code },
    });

    // Kiểm tra coupon có tồn tại
    if (!coupon) {
      return sendErrorResponse(
        res,
        "Mã coupon không tồn tại",
        "INVALID_CODE",
        404
      );
    }

    // Kiểm tra coupon có active không
    if (!coupon.is_active) {
      return sendErrorResponse(
        res,
        "Mã coupon đã bị vô hiệu hóa",
        "INACTIVE_COUPON",
        400
      );
    }

    // Kiểm tra hạn sử dụng
    if (coupon.expiry_date) {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day

      const expiryDate = new Date(coupon.expiry_date);
      expiryDate.setHours(0, 0, 0, 0); // Reset time to start of day

      // Nếu ngày tạo sau ngày hết hạn, sử dụng ngày tạo làm ngày bắt đầu
      const startDate = new Date(coupon.created_at);
      startDate.setHours(0, 0, 0, 0);

      // Kiểm tra nếu ngày hiện tại nằm trong khoảng từ ngày tạo đến ngày hết hạn
      if (today < startDate || today > expiryDate) {
        return sendErrorResponse(
          res,
          "Mã coupon chưa đến thời gian sử dụng hoặc đã hết hạn",
          "EXPIRED_COUPON",
          400
        );
      }
    }

    // Kiểm tra số lần sử dụng
    if (coupon.max_usage && coupon.usage_count >= coupon.max_usage) {
      return sendErrorResponse(
        res,
        "Mã coupon đã hết lượt sử dụng",
        "MAX_USAGE_REACHED",
        400
      );
    }

    // Tính discount_amount và final_price nếu có total
    let discount_amount = 0;
    let final_price = null;
    if (total !== undefined && total !== null) {
      if (coupon.type === "percent") {
        discount_amount = Math.round((total * coupon.discount) / 100);
        final_price = total - discount_amount;
      } else if (coupon.type === "fixed") {
        discount_amount = coupon.discount;
        final_price = total - discount_amount;
      }
      if (final_price < 0) final_price = 0;
    }

    // Nếu tất cả điều kiện đều hợp lệ
    res.json({
      success: true,
      message: "Mã coupon hợp lệ",
      data: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        discount: coupon.discount,
        discount_amount,
        final_price,
      },
    });
  } catch (error) {
    sendInternalErrorResponse(res, "Lỗi khi kiểm tra coupon: " + error.message);
  }
});

// Lấy danh sách user sử dụng coupon (có phân trang)
router.get("/:id/users", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const couponId = req.params.id;

    // Lấy tất cả payment thành công với coupon_id này
    const payments = await Payment.findAll({
      where: {
        coupon_id: couponId,
        payment_status: "SUCCESS",
      },
      include: [
        {
          model: User,
          attributes: ["id", "full_name"],
        },
      ],
      raw: true,
      nest: true,
    });

    // Nhóm theo user_id
    const userMap = {};
    payments.forEach((p) => {
      const userId = p.User?.id;
      const fullName = p.User?.full_name;
      if (!userId) return;
      if (!userMap[userId]) {
        userMap[userId] = {
          user_id: userId,
          full_name: fullName,
          total_payments: 0,
          total_amount: 0,
          last_payment_date: null,
          last_status: null,
        };
      }
      userMap[userId].total_payments += 1;
      userMap[userId].total_amount += Number(p.amount || 0);
      // Cập nhật ngày và trạng thái nếu mới hơn
      if (
        !userMap[userId].last_payment_date ||
        new Date(p.payment_date) > new Date(userMap[userId].last_payment_date)
      ) {
        userMap[userId].last_payment_date = p.payment_date;
        userMap[userId].last_status = p.payment_status;
      }
    });

    // Chuyển thành mảng và phân trang
    const users = Object.values(userMap);
    const total = users.length;
    const pagedUsers = users.slice(offset, offset + parseInt(limit));

    res.json({
      success: true,
      data: {
        list: pagedUsers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Lỗi khi lấy danh sách user sử dụng coupon: " + error.message
    );
  }
});

module.exports = router;
