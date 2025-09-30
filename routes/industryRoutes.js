const express = require("express");
const router = express.Router();
const { Industry, Category, CategoryIndustry } = require("../models");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
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

// Utility function to convert snake_case to camelCase
const toCamelCase = (str) => {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

// Utility function to transform object fields from snake_case to camelCase
const transformToCamelCase = (obj) => {
  if (!obj || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(transformToCamelCase);
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      transformed[camelKey] = transformToCamelCase(value);
    } else if (Array.isArray(value)) {
      transformed[camelKey] = value.map(transformToCamelCase);
    } else {
      transformed[camelKey] = value;
    }
  }
  return transformed;
};

// Lấy tất cả industries với pagination và search
router.get("/", async (req, res) => {
  try {
    const { page = 1, pageSize = 10, limit: queryLimit, searchTxt } = req.query;

    // Parse pagination parameters
    const pageNumber = parseInt(page);
    const limit = parseInt(queryLimit) || parseInt(pageSize) || 10;
    const offset = (pageNumber - 1) * limit;

    // Build where condition for search
    const whereCondition = {};
    if (searchTxt && searchTxt.trim()) {
      whereCondition.name = {
        [require("sequelize").Op.like]: `%${searchTxt.trim()}%`,
      };
    }

    // Get total count for pagination
    const totalCount = await Industry.count({ where: whereCondition });

    // Get paginated results
    const industries = await Industry.findAll({
      where: whereCondition,
      order: [["name", "ASC"]],
      limit: limit,
      offset: offset,
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = pageNumber < totalPages;
    const hasPrevPage = pageNumber > 1;

    const pagination = calculatePagination(totalCount, pageNumber, limit);
    sendListResponse(res, transformToCamelCase(industries), pagination);
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

// Lấy industries theo category_id
router.get("/by-category/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;

    const industries = await Industry.findAll({
      include: [
        {
          model: Category,
          as: "categories",
          where: { id: categoryId },
          through: { attributes: [] },
        },
      ],
      order: [["name", "ASC"]],
    });

    sendListResponse(
      res,
      transformToCamelCase(industries),
      calculatePagination(industries.length, 1, industries.length)
    );
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

    const industry = await Industry.findByPk(id);
    if (!industry) {
      return sendNotFoundResponse(res, "Không tìm thấy ngành nghề");
    }

    // Kiểm tra xem industry có đang được sử dụng trong category_industries không
    const categoryIndustries = await CategoryIndustry.count({
      where: { industry_id: id },
    });

    if (categoryIndustries > 0) {
      return sendErrorResponse(
        res,
        `Không thể xóa ngành nghề. Hiện tại đang được liên kết với ${categoryIndustries} danh mục. Vui lòng xóa các liên kết danh mục-ngành nghề trước.`,
        "INDUSTRY_IN_USE",
        409
      );
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
