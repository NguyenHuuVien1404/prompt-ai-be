/**
 * Utility functions for data transformation
 */

/**
 * Convert snake_case to camelCase
 * @param {string} str - The string to convert
 * @returns {string} - The converted camelCase string
 */
const toCamelCase = (str) => {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
};

/**
 * Transform object fields from snake_case to camelCase
 * Handles circular references and Sequelize instances safely
 * @param {*} obj - The object to transform
 * @param {WeakSet} seen - Set to track visited objects (for circular reference detection)
 * @returns {*} - The transformed object
 */
const transformToCamelCase = (obj, seen = new WeakSet()) => {
  if (!obj || typeof obj !== "object") return obj;

  // Check for circular reference
  if (seen.has(obj)) return obj;
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map((item) => transformToCamelCase(item, seen));
  }

  // Handle Sequelize instances - convert to plain object first
  if (obj.toJSON && typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }

  // Skip transformation for Date objects
  if (obj instanceof Date) {
    return obj;
  }

  const transformed = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);

    // Skip transformation for primitives and special types
    if (
      value === null ||
      value === undefined ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value instanceof Date
    ) {
      transformed[camelKey] = value;
    } else if (Array.isArray(value)) {
      transformed[camelKey] = value.map((item) =>
        transformToCamelCase(item, seen)
      );
    } else if (typeof value === "object") {
      transformed[camelKey] = transformToCamelCase(value, seen);
    } else {
      transformed[camelKey] = value;
    }
  }
  return transformed;
};

module.exports = {
  toCamelCase,
  transformToCamelCase,
};
