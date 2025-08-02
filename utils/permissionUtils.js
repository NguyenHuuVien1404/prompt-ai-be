/**
 * Utility functions for permission checking
 */

/**
 * Check if user has specific permission
 * @param {Array} userPermissions - Array of user permissions
 * @param {string} requiredPermission - Permission to check
 * @returns {boolean} - True if user has permission
 */
const hasPermission = (userPermissions, requiredPermission) => {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }

  // Check for exact match
  if (userPermissions.includes(requiredPermission)) {
    return true;
  }

  // Check for wildcard permissions
  if (userPermissions.includes("admin:all") || userPermissions.includes("*")) {
    return true;
  }

  // Check for role-specific wildcards
  const roleWildcards = {
    "user:all": ["user:read", "user:update", "user:create", "user:delete"],
    "marketer:all": [
      "marketer:read",
      "marketer:update",
      "marketer:create",
      "marketer:delete",
    ],
    "stats:all": ["stats:read", "stats:write", "stats:delete"],
  };

  for (const [wildcard, permissions] of Object.entries(roleWildcards)) {
    if (
      userPermissions.includes(wildcard) &&
      permissions.includes(requiredPermission)
    ) {
      return true;
    }
  }

  return false;
};

/**
 * Check if user has any of the required permissions
 * @param {Array} userPermissions - Array of user permissions
 * @param {Array} requiredPermissions - Array of permissions to check
 * @returns {boolean} - True if user has at least one permission
 */
const hasAnyPermission = (userPermissions, requiredPermissions) => {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }

  return requiredPermissions.some((permission) =>
    hasPermission(userPermissions, permission)
  );
};

/**
 * Check if user has all required permissions
 * @param {Array} userPermissions - Array of user permissions
 * @param {Array} requiredPermissions - Array of permissions to check
 * @returns {boolean} - True if user has all permissions
 */
const hasAllPermissions = (userPermissions, requiredPermissions) => {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }

  return requiredPermissions.every((permission) =>
    hasPermission(userPermissions, permission)
  );
};

/**
 * Get permissions for a specific role
 * @param {number} roleId - Role ID
 * @returns {Array} - Array of permissions for the role
 */
const getRolePermissions = (roleId) => {
  const rolePermissions = {
    1: ["user:read", "user:update"], // User permissions
    2: ["admin:all", "user:all", "role:all", "stats:all"], // Admin permissions
    3: ["marketer:all", "user:read", "stats:read"], // Marketer permissions
  };

  return rolePermissions[roleId] || ["user:read"];
};

/**
 * Parse permissions from JSON string
 * @param {string} permissionsJson - JSON string of permissions
 * @returns {Array} - Array of permissions
 */
const parsePermissions = (permissionsJson) => {
  if (!permissionsJson) {
    return [];
  }

  try {
    return JSON.parse(permissionsJson);
  } catch (error) {
    console.error("Error parsing permissions:", error);
    return [];
  }
};

/**
 * Get user permissions from JWT token or user object
 * @param {Object} user - User object or JWT payload
 * @returns {Array} - Array of user permissions
 */
const getUserPermissions = (user) => {
  if (!user) {
    return [];
  }

  // If permissions are already in the user object
  if (user.permissions && Array.isArray(user.permissions)) {
    return user.permissions;
  }

  // If permissions are in Role object
  if (user.Role && user.Role.permissions) {
    return parsePermissions(user.Role.permissions);
  }

  // Fallback to role-based permissions
  return getRolePermissions(user.role || user.role_id);
};

module.exports = {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  getRolePermissions,
  parsePermissions,
  getUserPermissions,
};
