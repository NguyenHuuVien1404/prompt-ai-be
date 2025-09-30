/**
 * Common database utilities
 */

const { Op } = require("sequelize");

/**
 * Build search condition for text fields
 * @param {string} searchText - Search text
 * @param {Array} fields - Fields to search in
 * @returns {Object} Sequelize search condition
 */
const buildSearchCondition = (searchText, fields) => {
  if (!searchText || !fields || fields.length === 0) {
    return {};
  }

  const searchConditions = fields.map((field) => ({
    [field]: {
      [Op.like]: `%${searchText}%`,
    },
  }));

  return {
    [Op.or]: searchConditions,
  };
};

/**
 * Build date range condition
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} field - Date field name
 * @returns {Object} Sequelize date condition
 */
const buildDateRangeCondition = (startDate, endDate, field = "created_at") => {
  const condition = {};

  if (startDate) {
    condition[Op.gte] = new Date(startDate);
  }

  if (endDate) {
    condition[Op.lte] = new Date(endDate);
  }

  return Object.keys(condition).length > 0 ? { [field]: condition } : {};
};

/**
 * Build IN condition for array values
 * @param {Array|string} values - Values to check
 * @param {string} field - Field name
 * @returns {Object} Sequelize IN condition
 */
const buildInCondition = (values, field) => {
  if (!values) return {};

  const valueArray = Array.isArray(values) ? values : values.split(",");
  const validValues = valueArray.map((v) => v.trim()).filter((v) => v !== "");

  return validValues.length > 0 ? { [field]: { [Op.in]: validValues } } : {};
};

/**
 * Build numeric range condition
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {string} field - Field name
 * @returns {Object} Sequelize range condition
 */
const buildNumericRangeCondition = (min, max, field) => {
  const condition = {};

  if (min !== undefined && min !== null && !isNaN(min)) {
    condition[Op.gte] = parseFloat(min);
  }

  if (max !== undefined && max !== null && !isNaN(max)) {
    condition[Op.lte] = parseFloat(max);
  }

  return Object.keys(condition).length > 0 ? { [field]: condition } : {};
};

/**
 * Build include options for associations
 * @param {Array} associations - Array of association configs
 * @returns {Array} Sequelize include options
 */
const buildIncludeOptions = (associations) => {
  return associations.map((assoc) => {
    const include = {
      model: assoc.model,
      attributes: assoc.attributes || undefined,
    };

    if (assoc.as) {
      include.as = assoc.as;
    }

    if (assoc.where) {
      include.where = assoc.where;
    }

    if (assoc.required !== undefined) {
      include.required = assoc.required;
    }

    if (assoc.through) {
      include.through = assoc.through;
    }

    return include;
  });
};

/**
 * Build order clause
 * @param {string} sortBy - Field to sort by
 * @param {string} sortOrder - Sort order (ASC/DESC)
 * @param {string} defaultSort - Default sort field
 * @returns {Array} Sequelize order clause
 */
const buildOrderClause = (
  sortBy,
  sortOrder = "DESC",
  defaultSort = "created_at"
) => {
  const field = sortBy || defaultSort;
  const order = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";

  return [[field, order]];
};

/**
 * Check if record exists
 * @param {Object} Model - Sequelize model
 * @param {Object} condition - Where condition
 * @returns {boolean} True if record exists
 */
const recordExists = async (Model, condition) => {
  const count = await Model.count({ where: condition });
  return count > 0;
};

/**
 * Get record count with condition
 * @param {Object} Model - Sequelize model
 * @param {Object} condition - Where condition
 * @returns {number} Record count
 */
const getRecordCount = async (Model, condition = {}) => {
  return await Model.count({ where: condition });
};

/**
 * Soft delete record
 * @param {Object} instance - Sequelize instance
 * @param {string} field - Soft delete field name
 * @returns {Object} Updated instance
 */
const softDelete = async (instance, field = "deleted_at") => {
  const updateData = { [field]: new Date() };
  return await instance.update(updateData);
};

/**
 * Restore soft deleted record
 * @param {Object} instance - Sequelize instance
 * @param {string} field - Soft delete field name
 * @returns {Object} Updated instance
 */
const restore = async (instance, field = "deleted_at") => {
  const updateData = { [field]: null };
  return await instance.update(updateData);
};

/**
 * Build pagination query options
 * @param {Object} options - Query options
 * @returns {Object} Sequelize query options
 */
const buildPaginationOptions = (options) => {
  const {
    page = 1,
    limit = 10,
    offset,
    order,
    where = {},
    include = [],
    attributes,
    group,
    having,
  } = options;

  const queryOptions = {
    where,
    limit: parseInt(limit),
    offset: offset || (parseInt(page) - 1) * parseInt(limit),
  };

  if (order) {
    queryOptions.order = order;
  }

  if (include.length > 0) {
    queryOptions.include = include;
  }

  if (attributes) {
    queryOptions.attributes = attributes;
  }

  if (group) {
    queryOptions.group = group;
  }

  if (having) {
    queryOptions.having = having;
  }

  return queryOptions;
};

/**
 * Execute paginated query
 * @param {Object} Model - Sequelize model
 * @param {Object} options - Query options
 * @returns {Object} Paginated result
 */
const executePaginatedQuery = async (Model, options) => {
  const queryOptions = buildPaginationOptions(options);

  const { count, rows } = await Model.findAndCountAll(queryOptions);

  return {
    data: rows,
    total: count,
    page: parseInt(options.page) || 1,
    limit: parseInt(options.limit) || 10,
  };
};

module.exports = {
  buildSearchCondition,
  buildDateRangeCondition,
  buildInCondition,
  buildNumericRangeCondition,
  buildIncludeOptions,
  buildOrderClause,
  recordExists,
  getRecordCount,
  softDelete,
  restore,
  buildPaginationOptions,
  executePaginatedQuery,
};
