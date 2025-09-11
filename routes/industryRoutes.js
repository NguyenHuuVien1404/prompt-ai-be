const express = require("express");
const router = express.Router();
const { Industry, Category, CategoryIndustry } = require("../models");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

// Lấy tất cả industries
router.get("/", async (req, res) => {
  try {
    const industries = await Industry.findAll({
      order: [["name", "ASC"]],
    });

    res.json({
      success: true,
      data: industries,
    });
  } catch (error) {
    console.error("Error fetching industries:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
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
      message: "Internal server error",
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
      message: "Internal server error",
    });
  }
});

// Tạo industry mới (chỉ admin)
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Name is required",
        });
      }

      const industry = await Industry.create({
        name,
        description,
      });

      res.status(201).json({
        success: true,
        data: industry,
        message: "Industry created successfully",
      });
    } catch (error) {
      console.error("Error creating industry:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Cập nhật industry (chỉ admin)
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description } = req.body;

      const industry = await Industry.findByPk(id);
      if (!industry) {
        return res.status(404).json({
          success: false,
          message: "Industry not found",
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
        message: "Industry updated successfully",
      });
    } catch (error) {
      console.error("Error updating industry:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Xóa industry (chỉ admin)
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;

      const industry = await Industry.findByPk(id);
      if (!industry) {
        return res.status(404).json({
          success: false,
          message: "Industry not found",
        });
      }

      await industry.destroy();

      res.json({
        success: true,
        message: "Industry deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting industry:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Liên kết category với industry (chỉ admin)
router.post(
  "/:industryId/categories/:categoryId",
  authMiddleware,
  roleMiddleware(["admin"]),
  async (req, res) => {
    try {
      const { industryId, categoryId } = req.params;

      // Kiểm tra industry và category có tồn tại không
      const industry = await Industry.findByPk(industryId);
      const category = await Category.findByPk(categoryId);

      if (!industry) {
        return res.status(404).json({
          success: false,
          message: "Industry not found",
        });
      }

      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category not found",
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
          message: "Category-Industry link already exists",
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
        message: "Category-Industry link created successfully",
      });
    } catch (error) {
      console.error("Error creating category-industry link:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

// Hủy liên kết category với industry (chỉ admin)
router.delete(
  "/:industryId/categories/:categoryId",
  authMiddleware,
  roleMiddleware(["admin"]),
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
          message: "Category-Industry link not found",
        });
      }

      await categoryIndustry.destroy();

      res.json({
        success: true,
        message: "Category-Industry link deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting category-industry link:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
);

module.exports = router;
