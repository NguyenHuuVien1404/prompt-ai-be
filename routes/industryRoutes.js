const express = require("express");
const router = express.Router();
const { Industry, Category, CategoryIndustry } = require("../models");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");

// Lấy tất cả industries với pagination và search
router.get("/", async (req, res) => {
  try {
    const { page = 1, pageSize = 10, searchTxt } = req.query;

    // Parse pagination parameters
    const pageNumber = parseInt(page);
    const limit = parseInt(pageSize);
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

    res.json({
      success: true,
      data: industries,
      pagination: {
        currentPage: pageNumber,
        pageSize: limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Error fetching industries:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
    });
  }
});

// Lấy industry theo ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const industry = await Industry.findByPk(id);
    if (!industry) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy ngành nghề",
      });
    }

    res.json({
      success: true,
      data: industry,
    });
  } catch (error) {
    console.error("Error fetching industry by ID:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
    });
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

    res.json({
      success: true,
      data: industries,
    });
  } catch (error) {
    console.error("Error fetching industries by category:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
    });
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

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error("Error fetching categories by industry:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
    });
  }
});

// Tạo industry mới (chỉ admin)
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Tên là bắt buộc",
      });
    }

    const industry = await Industry.create({
      name,
      description,
    });

    res.status(201).json({
      success: true,
      data: industry,
      message: "Tạo ngành nghề thành công",
    });
  } catch (error) {
    console.error("Error creating industry:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
    });
  }
});

// Cập nhật industry (chỉ admin)
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const industry = await Industry.findByPk(id);
    if (!industry) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy ngành nghề",
      });
    }

    await industry.update({
      name: name || industry.name,
      description:
        description !== undefined ? description : industry.description,
    });

    res.json({
      success: true,
      data: industry,
      message: "Cập nhật ngành nghề thành công",
    });
  } catch (error) {
    console.error("Error updating industry:", error);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
    });
  }
});

// Xóa industry (chỉ admin)
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const industry = await Industry.findByPk(id);
    if (!industry) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy ngành nghề",
        errorCode: "INDUSTRY_NOT_FOUND",
      });
    }

    // Kiểm tra xem industry có đang được sử dụng trong category_industries không
    const categoryIndustries = await CategoryIndustry.count({
      where: { industry_id: id },
    });

    if (categoryIndustries > 0) {
      return res.status(409).json({
        success: false,
        message: `Không thể xóa ngành nghề. Hiện tại đang được liên kết với ${categoryIndustries} danh mục. Vui lòng xóa các liên kết danh mục-ngành nghề trước.`,
        errorCode: "INDUSTRY_IN_USE",
        details: {
          linkedCategories: categoryIndustries,
        },
      });
    }

    await industry.destroy();

    res.json({
      success: true,
      message: "Xóa ngành nghề thành công",
    });
  } catch (error) {
    console.error("Error deleting industry:", error);

    // Xử lý foreign key constraint error
    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(409).json({
        success: false,
        message:
          "Không thể xóa ngành nghề vì hiện tại đang được liên kết với một hoặc nhiều danh mục. Vui lòng xóa các liên kết danh mục-ngành nghề trước.",
        errorCode: "FOREIGN_KEY_CONSTRAINT_VIOLATION",
        details: {
          constraint: error.parent?.sqlMessage || "Lỗi ràng buộc khóa ngoại",
        },
      });
    }

    // Xử lý các lỗi khác
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ nội bộ",
      errorCode: "INTERNAL_SERVER_ERROR",
    });
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
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy ngành nghề",
        });
      }

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy danh mục",
        });
      }

      // Kiểm tra liên kết đã tồn tại chưa
      const existingLink = await CategoryIndustry.findOne({
        where: {
          industry_id: industryId,
          category_id: categoryId,
        },
      });

      if (existingLink) {
        return res.status(400).json({
          success: false,
          message: "Liên kết danh mục-ngành nghề đã tồn tại",
        });
      }

      // Tạo liên kết mới
      const categoryIndustry = await CategoryIndustry.create({
        industry_id: industryId,
        category_id: categoryId,
      });

      res.status(201).json({
        success: true,
        data: categoryIndustry,
        message: "Tạo liên kết danh mục-ngành nghề thành công",
      });
    } catch (error) {
      console.error("Error creating category-industry link:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi máy chủ nội bộ",
      });
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
        return res.status(404).json({
          success: false,
          message: "Không tìm thấy liên kết danh mục-ngành nghề",
        });
      }

      await categoryIndustry.destroy();

      res.json({
        success: true,
        message: "Xóa liên kết danh mục-ngành nghề thành công",
      });
    } catch (error) {
      console.error("Error deleting category-industry link:", error);
      res.status(500).json({
        success: false,
        message: "Lỗi máy chủ nội bộ",
      });
    }
  }
);

module.exports = router;
