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

// Custom transform function for subscription data
const transformSubscriptionData = (data) => {
  // First apply camelCase transformation
  const camelCaseData = transformToCamelCase(data);

  // Then apply custom field renaming
  if (Array.isArray(camelCaseData)) {
    return camelCaseData.map((item) => transformSubscriptionData(item));
  }

  if (camelCaseData && typeof camelCaseData === "object") {
    const transformed = { ...camelCaseData };

    // Rename nameSub to name
    if (transformed.nameSub !== undefined) {
      transformed.name = transformed.nameSub;
      delete transformed.nameSub;
    }

    // Rename ContentSubscriptions to contentSubscriptions
    if (transformed.ContentSubscriptions !== undefined) {
      transformed.contentSubscriptions = transformed.ContentSubscriptions;
      delete transformed.ContentSubscriptions;
    }

    return transformed;
  }

  return camelCaseData;
};
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
    sendListResponse(res, transformSubscriptionData(rows), pagination);
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
      sendListResponse(res, transformSubscriptionData(rows), pagination);
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
        transformSubscriptionData(subscriptions),
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
      sendDetailResponse(res, transformSubscriptionData(subscriptions));
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
      const subscription = await Subscription.findByPk(req.params.id, {
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
      });
      if (!subscription) {
        return sendNotFoundResponse(res, "Không tìm thấy Subscription!");
      }
      sendDetailResponse(res, transformSubscriptionData(subscription));
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
      transformSubscriptionData(newSubscription),
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
      contentSubscriptions, // Array of content subscription objects
    } = req.body;

    const subscription = await Subscription.findByPk(req.params.id);
    if (!subscription) {
      return sendNotFoundResponse(res, "Không tìm thấy Subscription!");
    }

    // Update basic subscription fields
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

    // Update contentSubscriptions if provided
    if (contentSubscriptions && Array.isArray(contentSubscriptions)) {
      // Clear existing content subscriptions
      await ContentSubscription.destroy({
        where: { subscription_id: subscription.id },
      });

      // Create new content subscriptions
      const contentSubData = contentSubscriptions.map((content) => ({
        subscription_id: subscription.id,
        content: content.content,
        included: content.included !== undefined ? content.included : true,
      }));

      await ContentSubscription.bulkCreate(contentSubData);
    }

    // Fetch updated subscription with contentSubscriptions
    const updatedSubscription = await Subscription.findByPk(req.params.id, {
      include: [
        {
          model: ContentSubscription,
          attributes: ["id", "content", "included", "created_at", "updated_at"],
        },
      ],
    });

    sendUpdateResponse(
      res,
      transformSubscriptionData(updatedSubscription),
      "Subscription updated successfully"
    );
  } catch (error) {
    console.error("Error updating subscription:", error);
    sendInternalErrorResponse(res, "Lỗi khi cập nhật Subscription!");
  }
});

// Thêm ContentSubscription vào Subscription
router.post(
  "/:id/content-subscriptions",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { content, included = true } = req.body;

      if (!content) {
        return sendErrorResponse(
          res,
          "Content is required",
          "VALIDATION_ERROR",
          400
        );
      }

      const subscription = await Subscription.findByPk(req.params.id);
      if (!subscription) {
        return sendNotFoundResponse(res, "Không tìm thấy Subscription!");
      }

      const newContentSub = await ContentSubscription.create({
        subscription_id: subscription.id,
        content,
        included,
      });

      sendCreateResponse(
        res,
        transformSubscriptionData(newContentSub),
        "Content subscription added successfully"
      );
    } catch (error) {
      console.error("Error adding content subscription:", error);
      sendInternalErrorResponse(res, "Lỗi khi thêm ContentSubscription!");
    }
  }
);

// Cập nhật ContentSubscription
router.put(
  "/:id/content-subscriptions/:contentId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { content, included } = req.body;
      const { contentId } = req.params;

      const contentSub = await ContentSubscription.findOne({
        where: {
          id: contentId,
          subscription_id: req.params.id,
        },
      });

      if (!contentSub) {
        return sendNotFoundResponse(res, "Không tìm thấy ContentSubscription!");
      }

      await contentSub.update({
        content: content || contentSub.content,
        included: included !== undefined ? included : contentSub.included,
      });

      sendUpdateResponse(
        res,
        transformSubscriptionData(contentSub),
        "Content subscription updated successfully"
      );
    } catch (error) {
      console.error("Error updating content subscription:", error);
      sendInternalErrorResponse(res, "Lỗi khi cập nhật ContentSubscription!");
    }
  }
);

// Xóa ContentSubscription
router.delete(
  "/:id/content-subscriptions/:contentId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { contentId } = req.params;

      const contentSub = await ContentSubscription.findOne({
        where: {
          id: contentId,
          subscription_id: req.params.id,
        },
      });

      if (!contentSub) {
        return sendNotFoundResponse(res, "Không tìm thấy ContentSubscription!");
      }

      await contentSub.destroy();
      sendDeleteResponse(res, "Xóa ContentSubscription thành công!");
    } catch (error) {
      console.error("Error deleting content subscription:", error);
      sendInternalErrorResponse(res, "Lỗi khi xóa ContentSubscription!");
    }
  }
);

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
