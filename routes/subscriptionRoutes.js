const express = require("express");
const router = express.Router();
const Subscription = require("../models/Subscription");
const ContentSubscription = require("../models/ContentSubscription");
const UserSub = require("../models/UserSub");
const { User } = require("../models");
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
const buildSubscriptionAttributes = (payload = {}) => {
  const {
    name,
    type,
    duration,
    billingCycle,
    price,
    priceYear,
    pricePerMonthYear,
    priceTotalYearly,
    description,
    descriptionPerYear,
    imageDiscount,
    isPopular,
    isActive,
    displayOrder,
  } = payload;
  const sanitizeDecimal = (value) => {
    if (value === undefined || value === null) {
      return value;
    }
    const preparedValue = typeof value === "string" ? value.trim() : value;
    if (preparedValue === "") {
      return null;
    }
    return preparedValue;
  };
  const sanitizeText = (value) => {
    if (typeof value !== "string") {
      return value;
    }
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      return null;
    }
    return trimmedValue;
  };
  const sanitizeBoolean = (value) => {
    if (value === undefined || value === null) {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "") {
        return null;
      }
      if (["true", "1", "yes"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no"].includes(normalized)) {
        return false;
      }
      return null;
    }
    return Boolean(value);
  };
  const sanitizeInteger = (value) => {
    if (value === undefined || value === null) {
      return value;
    }
    const preparedValue = typeof value === "string" ? value.trim() : value;
    if (preparedValue === "") {
      return null;
    }
    const parsedValue = Number(preparedValue);
    if (Number.isNaN(parsedValue)) {
      return null;
    }
    return Math.trunc(parsedValue);
  };
  return {
    name_sub: name,
    type,
    duration,
    billing_cycle: billingCycle,
    price: sanitizeDecimal(price),
    price_year: sanitizeDecimal(priceYear),
    price_per_month_year: sanitizeDecimal(pricePerMonthYear),
    price_total_yearly: sanitizeDecimal(priceTotalYearly),
    description: sanitizeText(description),
    description_per_year: sanitizeText(descriptionPerYear),
    imageDiscount: sanitizeText(imageDiscount),
    is_popular: sanitizeBoolean(isPopular),
    is_active: sanitizeBoolean(isActive),
    display_order: sanitizeInteger(displayOrder),
  };
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
    const subscriptionAttributes = buildSubscriptionAttributes(req.body);
    const newSubscription = await Subscription.create(subscriptionAttributes);

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
    const { contentSubscriptions } = req.body;
    const subscriptionAttributes = buildSubscriptionAttributes(req.body);
    const subscription = await Subscription.findByPk(req.params.id);
    if (!subscription) {
      return sendNotFoundResponse(res, "Không tìm thấy Subscription!");
    }

    // Update basic subscription fields
    await subscription.update(subscriptionAttributes);

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

// Lấy danh sách users có subscription sắp hết hạn (theo subscription type hoặc ID) - loại bỏ free subscription mặc định
router.get(
  "/expiring",
  authMiddleware,
  adminOrMarketerMiddleware,
  async (req, res) => {
    try {
      const {
        days = 5,
        subscriptionId,
        subscriptionType,
        page = 1,
        pageSize = 10,
        includeFree = false,
        search,
        sortBy = "end_date",
        order = "ASC",
        dateFrom,
        dateTo,
      } = req.query;

      const daysValue = parseInt(days) || 5;
      const currentPage = parseInt(page) || 1;
      const limit = parseInt(pageSize) || 10;
      const offset = (currentPage - 1) * limit;
      const includeFreeValue = includeFree === "true" || includeFree === true;
      const sortOrder = order.toUpperCase() === "DESC" ? "DESC" : "ASC";

      // Xây dựng điều kiện where
      const whereConditions = {
        status: 1, // Chỉ kiểm tra subscription đang active
      };

      // Filter theo dateFrom và dateTo nếu có (ưu tiên), nếu không thì dùng days
      if (dateFrom || dateTo) {
        whereConditions.end_date = {};

        // Helper function để validate và parse date
        const validateAndParseDate = (dateString, paramName) => {
          // Check format YYYY-MM-DD
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(dateString)) {
            throw new Error(
              `${paramName} không hợp lệ. Vui lòng sử dụng định dạng YYYY-MM-DD (ví dụ: 2025-01-01)`
            );
          }

          const date = new Date(dateString);

          // Check nếu date không hợp lệ
          if (isNaN(date.getTime())) {
            throw new Error(
              `${paramName} không hợp lệ. Vui lòng sử dụng định dạng YYYY-MM-DD (ví dụ: 2025-01-01)`
            );
          }

          // Check nếu parse ra date khác với input (ví dụ: 2025-13-01 -> invalid month)
          const [year, month, day] = dateString.split("-").map(Number);
          if (
            date.getFullYear() !== year ||
            date.getMonth() + 1 !== month ||
            date.getDate() !== day
          ) {
            throw new Error(
              `${paramName} không hợp lệ. Vui lòng kiểm tra lại ngày, tháng, năm (ví dụ: 2025-01-01)`
            );
          }

          return date;
        };

        if (dateFrom) {
          try {
            const fromDate = validateAndParseDate(dateFrom, "dateFrom");
            fromDate.setHours(0, 0, 0, 0);
            whereConditions.end_date[Op.gte] = fromDate;
          } catch (error) {
            return sendInternalErrorResponse(res, error.message);
          }
        }

        if (dateTo) {
          try {
            const toDate = validateAndParseDate(dateTo, "dateTo");
            toDate.setHours(23, 59, 59, 999);
            whereConditions.end_date[Op.lte] = toDate;
          } catch (error) {
            return sendInternalErrorResponse(res, error.message);
          }
        }
      } else {
        // Nếu không có dateFrom/dateTo, dùng days để tính toán
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Tính ngày N ngày kể từ hôm nay
        const nDaysLater = new Date(today);
        nDaysLater.setDate(nDaysLater.getDate() + daysValue);
        nDaysLater.setHours(23, 59, 59, 999);

        whereConditions.end_date = {
          [Op.gte]: today, // end_date >= today (bao gồm cả hôm nay)
          [Op.lte]: nDaysLater, // end_date <= N ngày sau
        };
      }

      // Lọc theo subscription ID nếu có
      if (subscriptionId) {
        const parsedSubId = parseInt(subscriptionId);
        if (!isNaN(parsedSubId)) {
          whereConditions.sub_id = parsedSubId;
        }
      }

      // Include condition cho User - để search theo email/name
      const userInclude = {
        model: User,
        attributes: ["id", "email", "full_name", "created_at"],
      };

      // Filter search theo email hoặc name
      if (search) {
        userInclude.where = {
          [Op.or]: [
            { email: { [Op.like]: `%${search}%` } },
            { full_name: { [Op.like]: `%${search}%` } },
          ],
        };
        userInclude.required = true; // INNER JOIN để filter
      }

      // Include condition cho subscription type
      const subscriptionInclude = {
        model: Subscription,
        attributes: ["id", "name_sub", "type", "price"],
      };

      // Build where condition for subscription
      const subscriptionWhere = {};

      if (subscriptionType) {
        const parsedType = parseInt(subscriptionType);
        if (!isNaN(parsedType)) {
          subscriptionWhere.type = parsedType;
        }
      }

      // Nếu không include free và không có subscriptionType cụ thể, loại bỏ free subscription (type = 1)
      if (!includeFreeValue && !subscriptionType) {
        subscriptionWhere.type = { [Op.ne]: 1 }; // Loại bỏ Free subscription (type = 1)
      }

      if (Object.keys(subscriptionWhere).length > 0) {
        subscriptionInclude.where = subscriptionWhere;
        subscriptionInclude.required = true; // INNER JOIN để filter
      }

      // Get total count
      let totalCountQuery = {
        where: whereConditions,
      };

      const countIncludes = [];

      // Include User cho search filter
      if (search) {
        countIncludes.push({
          model: User,
          where: {
            [Op.or]: [
              { email: { [Op.like]: `%${search}%` } },
              { full_name: { [Op.like]: `%${search}%` } },
            ],
          },
          attributes: [],
          required: true,
        });
      }

      // Build subscription where for count query
      const countSubscriptionWhere = {};
      if (subscriptionType && !isNaN(parseInt(subscriptionType))) {
        countSubscriptionWhere.type = parseInt(subscriptionType);
      } else if (!includeFreeValue && !subscriptionType) {
        countSubscriptionWhere.type = { [Op.ne]: 1 }; // Loại bỏ Free subscription (type = 1)
      }

      if (Object.keys(countSubscriptionWhere).length > 0) {
        countIncludes.push({
          model: Subscription,
          where: countSubscriptionWhere,
          attributes: [],
          required: true,
        });
      }

      if (countIncludes.length > 0) {
        totalCountQuery.include = countIncludes;
        // Lấy tất cả IDs rồi đếm để tránh lỗi với distinct khi có nhiều includes
        const userSubs = await UserSub.findAll({
          ...totalCountQuery,
          attributes: ["id"],
        });
        totalCount = userSubs.length;
      } else {
        totalCount = await UserSub.count(totalCountQuery);
      }

      // Build order by clause
      let orderBy = [["end_date", sortOrder]];
      if (sortBy === "email" || sortBy === "userEmail") {
        orderBy = [[{ model: User }, "email", sortOrder]];
      } else if (sortBy === "name" || sortBy === "userName") {
        orderBy = [[{ model: User }, "full_name", sortOrder]];
      } else if (sortBy === "subscriptionName") {
        orderBy = [[{ model: Subscription }, "name_sub", sortOrder]];
      } else if (sortBy === "daysRemaining") {
        // Sort by daysRemaining requires calculation, we'll sort by end_date instead
        orderBy = [["end_date", sortOrder]];
      }

      // Get actual data
      const expiringUserSubs = await UserSub.findAll({
        where: whereConditions,
        include: [userInclude, subscriptionInclude],
        offset,
        limit,
        order: orderBy,
      });

      // Tính today để dùng cho daysRemaining
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Transform data
      const transformedData = expiringUserSubs.map((userSub) => {
        const endDate = new Date(userSub.end_date);
        const daysRemaining = Math.ceil(
          (endDate - today) / (1000 * 60 * 60 * 24)
        );

        return {
          userId: userSub.user_id,
          userEmail: userSub.User?.email || null,
          userName: userSub.User?.full_name || userSub.User?.email || null,
          subscriptionId: userSub.sub_id,
          subscriptionName: userSub.Subscription?.name_sub || null,
          subscriptionType: userSub.Subscription?.type || null,
          subscriptionPrice: userSub.Subscription?.price || null,
          userSubId: userSub.id,
          status: userSub.status,
          startDate: userSub.start_date,
          endDate: userSub.end_date,
          daysRemaining: daysRemaining,
          token: userSub.token,
        };
      });

      const pagination = calculatePagination(totalCount, currentPage, limit);

      const messageText =
        dateFrom || dateTo
          ? `from ${dateFrom || "beginning"} to ${dateTo || "end"}`
          : `within ${daysValue} days`;

      sendListResponse(
        res,
        transformSubscriptionData(transformedData),
        pagination,
        `Found ${totalCount} users with subscriptions expiring ${messageText}`
      );
    } catch (error) {
      console.error("Error getting expiring subscriptions:", error);
      sendInternalErrorResponse(
        res,
        "Lỗi khi lấy danh sách subscriptions sắp hết hạn!"
      );
    }
  }
);

module.exports = router;
