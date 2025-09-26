/**
 * Utility functions for consistent API responses
 */

/**
 * Success response for list data with pagination
 * @param {Object} res - Express response object
 * @param {Array} data - Array of data items
 * @param {Object} pagination - Pagination information
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const sendListResponse = (
  res,
  data,
  pagination,
  message = null,
  statusCode = 200
) => {
  const response = {
    success: true,
    data,
    pagination: {
      total: pagination.total || 0,
      page: pagination.page || 1,
      pageSize: pagination.pageSize || 10,
      totalPages: pagination.totalPages || 0,
      hasNext: pagination.hasNext || false,
      hasPrev: pagination.hasPrev || false,
    },
  };

  if (message) {
    response.message = message;
  }

  res.status(statusCode).json(response);
};

/**
 * Success response for single item data
 * @param {Object} res - Express response object
 * @param {Object} data - Single data item
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const sendDetailResponse = (res, data, message = null, statusCode = 200) => {
  const response = {
    success: true,
    data,
  };

  if (message) {
    response.message = message;
  }

  res.status(statusCode).json(response);
};

/**
 * Success response for create operations
 * @param {Object} res - Express response object
 * @param {Object} data - Created data item
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 201)
 */
const sendCreateResponse = (res, data, message, statusCode = 201) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Success response for update operations
 * @param {Object} res - Express response object
 * @param {Object} data - Updated data item
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const sendUpdateResponse = (res, data, message, statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Success response for delete operations
 * @param {Object} res - Express response object
 * @param {string} message - Success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
const sendDeleteResponse = (res, message, statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
  });
};

/**
 * Error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {number} statusCode - HTTP status code (default: 400)
 */
const sendErrorResponse = (res, message, code = "ERROR", statusCode = 400) => {
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};

/**
 * Not found error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const sendNotFoundResponse = (res, message = "Resource not found") => {
  sendErrorResponse(res, message, "NOT_FOUND", 404);
};

/**
 * Validation error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const sendValidationErrorResponse = (res, message = "Validation error") => {
  sendErrorResponse(res, message, "VALIDATION_ERROR", 400);
};

/**
 * Unauthorized error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const sendUnauthorizedResponse = (res, message = "Unauthorized") => {
  sendErrorResponse(res, message, "UNAUTHORIZED", 401);
};

/**
 * Forbidden error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const sendForbiddenResponse = (res, message = "Forbidden") => {
  sendErrorResponse(res, message, "FORBIDDEN", 403);
};

/**
 * Internal server error response
 * @param {Object} res - Express response object
 * @param {string} message - Error message
 */
const sendInternalErrorResponse = (res, message = "Internal server error") => {
  sendErrorResponse(res, message, "INTERNAL_ERROR", 500);
};

/**
 * Calculate pagination info
 * @param {number} total - Total number of items
 * @param {number} page - Current page
 * @param {number} pageSize - Items per page
 * @returns {Object} Pagination information
 */
const calculatePagination = (total, page, pageSize) => {
  const totalPages = Math.ceil(total / pageSize);
  return {
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

module.exports = {
  sendListResponse,
  sendDetailResponse,
  sendCreateResponse,
  sendUpdateResponse,
  sendDeleteResponse,
  sendErrorResponse,
  sendNotFoundResponse,
  sendValidationErrorResponse,
  sendUnauthorizedResponse,
  sendForbiddenResponse,
  sendInternalErrorResponse,
  calculatePagination,
};
