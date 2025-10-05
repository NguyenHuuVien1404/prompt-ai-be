const express = require("express");
const router = express.Router();
const { Industry, Category, CategoryIndustry } = require("../models");
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

// Import transform utilities
const { transformToCamelCase } = require("../utils/transformUtils");

// Lấy tất cả industries với pagination và search
router.get("/", async (req, res) => {
  try {
    const {
      page,
      pageIndex,
      pageSize,
      limit: queryLimit,
      searchTxt,
      search,
      searchTerm,
      categoryIds,
    } = req.query;

    // Normalize search parameters
    const search_normalized = searchTxt || search || searchTerm;

    // Build where condition for search
    const whereCondition = {};
    if (search_normalized && search_normalized.trim()) {
      whereCondition.name = {
        [require("sequelize").Op.like]: `%${search_normalized.trim()}%`,
      };
    }

    // Handle categoryIds filtering
    let includeOptions = [];
    if (categoryIds) {
      const categoryIdArray = Array.isArray(categoryIds)
        ? categoryIds.map((id) => parseInt(id))
        : [parseInt(categoryIds)];

      const validCategoryIds = categoryIdArray.filter(
        (id) => !isNaN(id) && id > 0
      );

      if (validCategoryIds.length > 0) {
        includeOptions.push({
          model: Category,
          as: "categories",
          where: { id: validCategoryIds },
          through: { attributes: [] },
          required: true, // INNER JOIN để filter
        });
      }
    }

    // Check if pagination is explicitly requested
    // Only apply pagination if user explicitly provides these params
    const hasPagination =
      page !== undefined ||
      pageIndex !== undefined ||
      pageSize !== undefined ||
      queryLimit !== undefined;

    if (hasPagination) {
      // Parse pagination parameters
      const pageNumber = parseInt(page || pageIndex) || 1;
      const limit = parseInt(queryLimit) || parseInt(pageSize) || 10;
      const offset = (pageNumber - 1) * limit;

      // Get total count for pagination
      const totalCount = await Industry.count({
        where: whereCondition,
        include: includeOptions,
        distinct: true,
      });

      // Get paginated results
      const industries = await Industry.findAll({
        where: whereCondition,
        include: includeOptions,
        order: [["name", "ASC"]],
        limit: limit,
        offset: offset,
      });

      const pagination = calculatePagination(totalCount, pageNumber, limit);
      sendListResponse(res, transformToCamelCase(industries), pagination);
    } else {
      // No pagination - return all results
      const industries = await Industry.findAll({
        where: whereCondition,
        include: includeOptions,
        order: [["name", "ASC"]],
      });

      const pagination = {
        totalCount: industries.length,
        currentPage: 1,
        pageSize: industries.length,
        totalPages: 1,
      };
      sendListResponse(res, transformToCamelCase(industries), pagination);
    }
  } catch (error) {
    console.error("Error fetching industries:", error);
    sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
  }
});

// Lấy industry theo ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const industry = await Industry.findByPk(id);
    if (!industry) {
      return sendNotFoundResponse(res, "Không tìm thấy ngành nghề");
    }

    sendDetailResponse(res, transformToCamelCase(industry));
  } catch (error) {
    console.error("Error fetching industry by ID:", error);
    sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
  }
});

// Lấy industries theo category_id (hỗ trợ multiple IDs qua query)
router.get("/by-category/:categoryId?", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { categoryIds } = req.query;

    // Xử lý categoryIds - ưu tiên query parameter
    let categoryIdArray = [];

    if (categoryIds) {
      categoryIdArray = Array.isArray(categoryIds)
        ? categoryIds.map((id) => parseInt(id))
        : [parseInt(categoryIds)];
    } else if (categoryId) {
      categoryIdArray = [parseInt(categoryId)];
    } else {
      return sendErrorResponse(
        res,
        "Category ID is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Lọc bỏ các giá trị không hợp lệ
    categoryIdArray = categoryIdArray.filter((id) => !isNaN(id) && id > 0);

    if (categoryIdArray.length === 0) {
      return sendErrorResponse(
        res,
        "Valid category ID(s) required",
        "VALIDATION_ERROR",
        400
      );
    }

    const industries = await Industry.findAll({
      include: [
        {
          model: Category,
          as: "categories",
          where: { id: categoryIdArray },
          through: { attributes: [] },
        },
      ],
      order: [["name", "ASC"]],
    });

    if (industries.length === 0) {
      return sendNotFoundResponse(res, "Không tìm thấy ngành nghề");
    }

    const pagination = {
      totalCount: industries.length,
      currentPage: 1,
      pageSize: industries.length,
      totalPages: 1,
    };

    sendListResponse(res, transformToCamelCase(industries), pagination);
  } catch (error) {
    console.error("Error fetching industries by category:", error);
    sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
  }
});

// Lấy categories theo industry_id
router.get("/:industryId/categories", async (req, res) => {
  try {
    const { industryId } = req.params;

    const categories = await Category.findAll({
      include: [
        {
          model: Industry,
          as: "industries",
          where: { id: industryId },
          through: { attributes: [] },
        },
      ],
      order: [["name", "ASC"]],
    });

    sendListResponse(
      res,
      transformToCamelCase(categories),
      calculatePagination(categories.length, 1, categories.length)
    );
  } catch (error) {
    console.error("Error fetching categories by industry:", error);
    sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
  }
});

// Tạo industry mới (chỉ admin)
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return sendErrorResponse(res, "Tên là bắt buộc", "VALIDATION_ERROR", 400);
    }

    const industry = await Industry.create({
      name,
      description,
    });

    sendCreateResponse(
      res,
      transformToCamelCase(industry),
      "Tạo ngành nghề thành công"
    );
  } catch (error) {
    console.error("Error creating industry:", error);
    sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
  }
});

// Cập nhật industry (chỉ admin)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const industry = await Industry.findByPk(id);
    if (!industry) {
      return sendNotFoundResponse(res, "Không tìm thấy ngành nghề");
    }

    await industry.update({
      name: name || industry.name,
      description:
        description !== undefined ? description : industry.description,
    });

    sendUpdateResponse(
      res,
      transformToCamelCase(industry),
      "Cập nhật ngành nghề thành công"
    );
  } catch (error) {
    console.error("Error updating industry:", error);
    sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
  }
});

// Xóa industry (chỉ admin)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query; // Thêm option force delete

    const industry = await Industry.findByPk(id);
    if (!industry) {
      return sendNotFoundResponse(res, "Không tìm thấy ngành nghề");
    }

    // Kiểm tra xem industry có đang được sử dụng trong category_industries không
    const categoryIndustries = await CategoryIndustry.count({
      where: { industry_id: id },
    });

    if (categoryIndustries > 0 && !force) {
      return sendErrorResponse(
        res,
        `Không thể xóa ngành nghề. Hiện tại đang được liên kết với ${categoryIndustries} danh mục. Vui lòng xóa các liên kết danh mục-ngành nghề trước hoặc sử dụng ?force=true để xóa tất cả liên kết.`,
        "INDUSTRY_IN_USE",
        409
      );
    }

    // Nếu force=true, xóa tất cả liên kết trước
    if (force && categoryIndustries > 0) {
      await CategoryIndustry.destroy({
        where: { industry_id: id },
      });
    }

    await industry.destroy();

    sendDeleteResponse(res, "Xóa ngành nghề thành công");
  } catch (error) {
    console.error("Error deleting industry:", error);

    // Xử lý foreign key constraint error
    if (error.name === "SequelizeForeignKeyConstraintError") {
      return sendErrorResponse(
        res,
        "Không thể xóa ngành nghề vì hiện tại đang được liên kết với một hoặc nhiều danh mục. Vui lòng xóa các liên kết danh mục-ngành nghề trước.",
        "FOREIGN_KEY_CONSTRAINT_VIOLATION",
        409
      );
    }

    // Xử lý các lỗi khác
    sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
  }
});

// Liên kết category với industry (chỉ admin)
router.post(
  "/:industryId/categories/:categoryId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { industryId, categoryId } = req.params;

      // Kiểm tra industry và category có tồn tại không
      const industry = await Industry.findByPk(industryId);
      const category = await Category.findByPk(categoryId);

      if (!industry) {
        return sendNotFoundResponse(res, "Không tìm thấy ngành nghề");
      }

      if (!category) {
        return sendNotFoundResponse(res, "Không tìm thấy danh mục");
      }

      // Kiểm tra liên kết đã tồn tại chưa
      const existingLink = await CategoryIndustry.findOne({
        where: {
          industry_id: industryId,
          category_id: categoryId,
        },
      });

      if (existingLink) {
        return sendErrorResponse(
          res,
          "Liên kết danh mục-ngành nghề đã tồn tại",
          "DUPLICATE_LINK",
          400
        );
      }

      // Tạo liên kết mới
      const categoryIndustry = await CategoryIndustry.create({
        industry_id: industryId,
        category_id: categoryId,
      });

      sendCreateResponse(
        res,
        transformToCamelCase(categoryIndustry),
        "Tạo liên kết danh mục-ngành nghề thành công"
      );
    } catch (error) {
      console.error("Error creating category-industry link:", error);
      sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
    }
  }
);

// Hủy liên kết category với industry (chỉ admin)
router.delete(
  "/:industryId/categories/:categoryId",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { industryId, categoryId } = req.params;

      const categoryIndustry = await CategoryIndustry.findOne({
        where: {
          industry_id: industryId,
          category_id: categoryId,
        },
      });

      if (!categoryIndustry) {
        return sendNotFoundResponse(
          res,
          "Không tìm thấy liên kết danh mục-ngành nghề"
        );
      }

      await categoryIndustry.destroy();

      sendDeleteResponse(res, "Xóa liên kết danh mục-ngành nghề thành công");
    } catch (error) {
      console.error("Error deleting category-industry link:", error);
      sendInternalErrorResponse(res, "Lỗi máy chủ nội bộ");
    }
  }
);

module.exports = router;
