const express = require("express");
const router = express.Router();
const Subscription = require("../models/Subscription");
const ContentSubscription = require("../models/ContentSubscription");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const { adminOrMarketerMiddleware } = require("../middleware/roleMiddleware");
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
const { Op } = require("sequelize");

// Import transform utilities
const { transformToCamelCase } = require("../utils/transformUtils");
// Lấy danh sách Subscription (GET route for RESTful API)
router.get("/", async (req, res) => {
  try {
    // Lấy tham số từ query parameters
    let {
      page,
      pageIndex,
      pageSize = 10,
      search,
      searchTerm,
      type,
      duration,
      isPopular,
      is_popular,
      priceMin,
      priceMax,
    } = req.query;

    // Normalize parameters
    const search_normalized = search || searchTerm;
    const is_popular_normalized =
      isPopular !== undefined ? isPopular : is_popular;

    // Đảm bảo các tham số số nguyên không bị NaN
    const currentPage = parseInt(page || pageIndex) || 1;
    const limit = parseInt(pageSize) || 10;
    const offset = (currentPage - 1) * limit;

    // Xây dựng điều kiện tìm kiếm
    const whereConditions = {};

    // Tìm kiếm theo tên subscription
    if (search_normalized) {
      whereConditions[Op.and] = whereConditions[Op.and] || [];
      whereConditions[Op.and].push({
        name_sub: { [Op.like]: `%${search_normalized}%` },
      });
    }

    // Lọc theo type
    if (type !== undefined && type !== null) {
      const parsedType = parseInt(type);
      if (!isNaN(parsedType)) {
        whereConditions.type = parsedType;
      }
    }

    // Lọc theo duration
    if (duration !== undefined && duration !== null) {
      const parsedDuration = parseInt(duration);
      if (!isNaN(parsedDuration)) {
        whereConditions.duration = parsedDuration;
      }
    }

    // Lọc theo is_popular
    if (is_popular_normalized !== undefined && is_popular_normalized !== null) {
      if (typeof is_popular_normalized === "string") {
        whereConditions.is_popular = is_popular_normalized === "true";
      } else {
        whereConditions.is_popular = !!is_popular_normalized;
      }
    }

    // Lọc theo giá
    if (priceMin !== undefined && priceMin !== null) {
      const parsedPriceMin = parseFloat(priceMin);
      if (!isNaN(parsedPriceMin)) {
        whereConditions.price = {
          ...whereConditions.price,
          [Op.gte]: parsedPriceMin,
        };
      }
    }
    if (priceMax !== undefined && priceMax !== null) {
      const parsedPriceMax = parseFloat(priceMax);
      if (!isNaN(parsedPriceMax)) {
        whereConditions.price = {
          ...whereConditions.price,
          [Op.lte]: parsedPriceMax,
        };
      }
    }

    // Get total count
    const totalCount = await Subscription.count({ where: whereConditions });

    // Get actual data
    const rows = await Subscription.findAll({
      include: [
        {
          model: ContentSubscription,
          attributes: ["id", "content", "included", "created_at", "updated_at"],
        },
      ],
      where: whereConditions,
      offset,
      limit,
      order: [["created_at", "DESC"]],
    });

    const pagination = calculatePagination(totalCount, currentPage, limit);
    sendListResponse(res, transformToCamelCase(rows), pagination);
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});
// Lấy danh sách Subscription (POST route for backward compatibility)
router.post(
  "/list",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      let { page = 1, limit = 10, duration } = req.body;
      page = parseInt(page);
      limit = parseInt(limit);

      if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
        return sendErrorResponse(
          res,
          "Invalid page or limit value",
          "VALIDATION_ERROR",
          400
        );
      }

      const offset = (page - 1) * limit;

      // Tạo điều kiện lọc nếu có duration
      const whereClause = {};
      if (duration) {
        whereClause.duration = duration;
      }

      const { count, rows } = await Subscription.findAndCountAll({
        where: whereClause, // Thêm điều kiện lọc
        limit,
        offset,
        order: [["created_at", "DESC"]], // Sắp xếp theo thời gian tạo mới nhất
      });

      const pagination = calculatePagination(count, page, limit);
      sendListResponse(res, transformToCamelCase(rows), pagination);
    } catch (error) {
      sendInternalErrorResponse(res, error.message);
    }
  }
);
router.get(
  "/by-duration",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      // const { duration } = req.query;

      // // Kiểm tra nếu duration không được cung cấp
      // if (!duration) {
      //     return res.status(400).json({ error: "Duration is required" });
      // }

      // Lấy danh sách subscription theo duration
      const subscriptions = await Subscription.findAll({
        include: [
          {
            model: ContentSubscription,
            attributes: [
              "id",
              "content",
              "included",
              "created_at",
              "updated_at",
            ],
          },
        ],
        order: [["updated_at", "DESC"]],
      });

      sendListResponse(
        res,
        transformToCamelCase(subscriptions),
        calculatePagination(subscriptions.length, 1, subscriptions.length)
      );
    } catch (error) {
      sendInternalErrorResponse(
        res,
        "Lỗi khi lấy danh sách Subscription theo duration!"
      );
    }
  }
);
// Lấy theo duration và type để cập nhật
router.get(
  "/by-duration-and-type",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const { duration, type } = req.query;

      // Kiểm tra nếu duration không được cung cấp
      if (!duration) {
        return sendErrorResponse(
          res,
          "Duration is required",
          "VALIDATION_ERROR",
          400
        );
      }
      // Lấy danh sách subscription theo duration
      const subscriptions = await Subscription.findOne({
        where: { duration: duration, type: type },
        include: [
          {
            model: ContentSubscription,
            attributes: [
              "id",
              "content",
              "included",
              "created_at",
              "updated_at",
            ],
          },
        ],
        order: [["updated_at", "DESC"]],
      });

      if (!subscriptions) {
        return sendNotFoundResponse(res, "Không tìm thấy Subscription!");
      }
      sendDetailResponse(res, transformToCamelCase(subscriptions));
    } catch (error) {
      sendInternalErrorResponse(
        res,
        "Lỗi khi lấy danh sách Subscription theo duration!"
      );
    }
  }
);
// Lấy Subscription theo ID
router.get(
  "/:id",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const subscription = await Subscription.findByPk(req.params.id);
      if (!subscription) {
        return sendNotFoundResponse(res, "Không tìm thấy Subscription!");
      }
      sendDetailResponse(res, transformToCamelCase(subscription));
    } catch (error) {
      sendInternalErrorResponse(res, "Lỗi khi lấy Subscription!");
    }
  }
);

// Tạo Subscription mới
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      name_sub,
      type,
      duration,
      billing_cycle,
      price,
      price_year,
      price_per_month_year,
      price_total_yearly,
      description,
      description_per_year,
      imageDiscount,
      is_popular,
    } = req.body;

    const newSubscription = await Subscription.create({
      name_sub,
      type,
      duration,
      billing_cycle,
      price,
      price_year,
      price_per_month_year,
      price_total_yearly,
      description,
      description_per_year,
      imageDiscount,
      is_popular,
    });

    sendCreateResponse(
      res,
      transformToCamelCase(newSubscription),
      "Subscription created successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, error.message);
  }
});

// Cập nhật Subscription
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      name_sub,
      type,
      duration,
      billing_cycle,
      price,
      price_year,
      price_per_month_year,
      price_total_yearly,
      description,
      description_per_year,
      imageDiscount,
      is_popular,
    } = req.body;

    const subscription = await Subscription.findByPk(req.params.id);
    if (!subscription) {
      return sendNotFoundResponse(res, "Không tìm thấy Subscription!");
    }

    await subscription.update({
      name_sub,
      type,
      duration,
      billing_cycle,
      price,
      price_year,
      price_per_month_year,
      price_total_yearly,
      description,
      description_per_year,
      imageDiscount,
      is_popular,
    });

    sendUpdateResponse(
      res,
      transformToCamelCase(subscription),
      "Subscription updated successfully"
    );
  } catch (error) {
    sendInternalErrorResponse(res, "Lỗi khi cập nhật Subscription!");
  }
});

// Xóa Subscription
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const subscription = await Subscription.findByPk(req.params.id);
    if (!subscription) {
      return sendNotFoundResponse(res, "Không tìm thấy Subscription!");
    }
    await subscription.destroy();
    sendDeleteResponse(res, "Xóa Subscription thành công!");
  } catch (error) {
    sendInternalErrorResponse(res, "Lỗi khi xóa Subscription!");
  }
});
module.exports = router;
