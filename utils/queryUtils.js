const { Op } = require("sequelize");

/**
 * Tạo filter options cho query với category và industry
 * @param {Object} filters - Object chứa các filter
 * @param {number} filters.categoryId - ID của category
 * @param {number} filters.industryId - ID của industry
 * @param {Array} filters.categoryIds - Array các category IDs
 * @param {Array} filters.industryIds - Array các industry IDs
 * @returns {Object} - Filter options cho Sequelize query
 */
const createCategoryIndustryFilter = (filters = {}) => {
  const { categoryId, industryId, categoryIds, industryIds } = filters;

  const whereClause = {};
  const includeClause = [];

  // Filter theo category
  if (categoryId || categoryIds) {
    const categoryFilter = categoryId ? [categoryId] : categoryIds;

    includeClause.push({
      association: "categories",
      where: {
        id: {
          [Op.in]: categoryFilter,
        },
      },
      through: { attributes: [] },
      required: true,
    });
  }

  // Filter theo industry
  if (industryId || industryIds) {
    const industryFilter = industryId ? [industryId] : industryIds;

    includeClause.push({
      association: "industries",
      where: {
        id: {
          [Op.in]: industryFilter,
        },
      },
      through: { attributes: [] },
      required: true,
    });
  }

  return {
    where: whereClause,
    include: includeClause,
  };
};

/**
 * Tạo filter cho prompts với category và industry
 * @param {Object} filters - Object chứa các filter
 * @returns {Object} - Filter options cho Sequelize query
 */
const createPromptFilter = (filters = {}) => {
  const { categoryId, industryId, categoryIds, industryIds, ...otherFilters } =
    filters;

  const whereClause = { ...otherFilters };
  const includeClause = [];

  // Include category với filter
  if (categoryId || categoryIds || industryId || industryIds) {
    const categoryInclude = {
      association: "category",
      required: true,
    };

    // Filter category trực tiếp
    if (categoryId || categoryIds) {
      const categoryFilter = categoryId ? [categoryId] : categoryIds;
      categoryInclude.where = {
        id: {
          [Op.in]: categoryFilter,
        },
      };
    }

    // Filter industry thông qua category
    if (industryId || industryIds) {
      const industryFilter = industryId ? [industryId] : industryIds;
      categoryInclude.include = [
        {
          association: "industries",
          where: {
            id: {
              [Op.in]: industryFilter,
            },
          },
          through: { attributes: [] },
          required: true,
        },
      ];
    }

    includeClause.push(categoryInclude);
  }

  return {
    where: whereClause,
    include: includeClause,
  };
};

/**
 * Tạo filter cho courses với category và industry
 * @param {Object} filters - Object chứa các filter
 * @returns {Object} - Filter options cho Sequelize query
 */
const createCourseFilter = (filters = {}) => {
  const { categoryId, industryId, categoryIds, industryIds, ...otherFilters } =
    filters;

  const whereClause = { ...otherFilters };
  const includeClause = [];

  // Include category với filter
  if (categoryId || categoryIds || industryId || industryIds) {
    const categoryInclude = {
      association: "category",
      required: true,
    };

    // Filter category trực tiếp
    if (categoryId || categoryIds) {
      const categoryFilter = categoryId ? [categoryId] : categoryIds;
      categoryInclude.where = {
        id: {
          [Op.in]: categoryFilter,
        },
      };
    }

    // Filter industry thông qua category
    if (industryId || industryIds) {
      const industryFilter = industryId ? [industryId] : industryIds;
      categoryInclude.include = [
        {
          association: "industries",
          where: {
            id: {
              [Op.in]: industryFilter,
            },
          },
          through: { attributes: [] },
          required: true,
        },
      ];
    }

    includeClause.push(categoryInclude);
  }

  return {
    where: whereClause,
    include: includeClause,
  };
};

/**
 * Tạo filter cho blogs với category và industry
 * @param {Object} filters - Object chứa các filter
 * @returns {Object} - Filter options cho Sequelize query
 */
const createBlogFilter = (filters = {}) => {
  const { categoryId, industryId, categoryIds, industryIds, ...otherFilters } =
    filters;

  const whereClause = { ...otherFilters };
  const includeClause = [];

  // Include category với filter
  if (categoryId || categoryIds || industryId || industryIds) {
    const categoryInclude = {
      association: "category",
      required: true,
    };

    // Filter category trực tiếp
    if (categoryId || categoryIds) {
      const categoryFilter = categoryId ? [categoryId] : categoryIds;
      categoryInclude.where = {
        id: {
          [Op.in]: categoryFilter,
        },
      };
    }

    // Filter industry thông qua category
    if (industryId || industryIds) {
      const industryFilter = industryId ? [industryId] : industryIds;
      categoryInclude.include = [
        {
          association: "industries",
          where: {
            id: {
              [Op.in]: industryFilter,
            },
          },
          through: { attributes: [] },
          required: true,
        },
      ];
    }

    includeClause.push(categoryInclude);
  }

  return {
    where: whereClause,
    include: includeClause,
  };
};

/**
 * Tạo pagination options
 * @param {Object} options - Pagination options
 * @param {number} options.page - Trang hiện tại (bắt đầu từ 1)
 * @param {number} options.limit - Số lượng items per page
 * @returns {Object} - Pagination options cho Sequelize query
 */
const createPaginationOptions = (options = {}) => {
  const { page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  return {
    limit: parseInt(limit),
    offset: parseInt(offset),
  };
};

/**
 * Tạo sort options
 * @param {Object} options - Sort options
 * @param {string} options.sortBy - Field để sort
 * @param {string} options.sortOrder - Order (ASC hoặc DESC)
 * @returns {Array} - Sort options cho Sequelize query
 */
const createSortOptions = (options = {}) => {
  const { sortBy = "created_at", sortOrder = "DESC" } = options;

  return [[sortBy, sortOrder.toUpperCase()]];
};

module.exports = {
  createCategoryIndustryFilter,
  createPromptFilter,
  createCourseFilter,
  createBlogFilter,
  createPaginationOptions,
  createSortOptions,
};
