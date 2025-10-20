/**
 * Field transformation utilities for consistent camelCase/snake_case handling
 * across all API routes
 */

// Utility function to convert snake_case to camelCase
const toCamelCase = (str) => {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

// Utility function to convert camelCase to snake_case
const toSnakeCase = (str) => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

// Utility function to transform object fields from snake_case to camelCase
const transformToCamelCase = (obj, seen = new WeakSet()) => {
  if (!obj || typeof obj !== "object") return obj;

  // Check for circular reference
  if (seen.has(obj)) return obj;
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => transformToCamelCase(item, seen));
  }

  // Handle Date objects - return as ISO string
  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Handle Sequelize instances - convert to plain object first
  if (obj.toJSON && typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);

    // Handle Date objects
    if (value instanceof Date) {
      transformed[camelKey] = value.toISOString();
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      transformed[camelKey] = transformToCamelCase(value, seen);
    } else if (Array.isArray(value)) {
      transformed[camelKey] = value.map((item) =>
        transformToCamelCase(item, seen)
      );
    } else {
      transformed[camelKey] = value;
    }
  }
  return transformed;
};

// Utility function to transform object fields from camelCase to snake_case
const transformToSnakeCase = (obj, seen = new WeakSet()) => {
  if (!obj || typeof obj !== "object") return obj;

  // Check for circular reference
  if (seen.has(obj)) return obj;
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => transformToSnakeCase(item, seen));
  }

  // Handle Date objects - return as is
  if (obj instanceof Date) {
    return obj;
  }

  // Handle Sequelize instances - convert to plain object first
  if (obj.toJSON && typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);

    // Handle Date objects
    if (value instanceof Date) {
      transformed[snakeKey] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      transformed[snakeKey] = transformToSnakeCase(value, seen);
    } else if (Array.isArray(value)) {
      transformed[snakeKey] = value.map((item) =>
        transformToSnakeCase(item, seen)
      );
    } else {
      transformed[snakeKey] = value;
    }
  }
  return transformed;
};

// Utility function to safely update model with field transformation
const safeUpdate = async (model, data, options = {}) => {
  const transformedData = transformToSnakeCase(data);
  return await model.update(transformedData, options);
};

// Utility function to safely create model with field transformation
const safeCreate = async (model, data, options = {}) => {
  const transformedData = transformToSnakeCase(data);
  return await model.create(transformedData, options);
};

// Utility function to safely bulk create with field transformation
const safeBulkCreate = async (model, data, options = {}) => {
  const transformedData = data.map((item) => transformToSnakeCase(item));
  return await model.bulkCreate(transformedData, options);
};

module.exports = {
  toCamelCase,
  toSnakeCase,
  transformToCamelCase,
  transformToSnakeCase,
  safeUpdate,
  safeCreate,
  safeBulkCreate,
};
