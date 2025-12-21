const cache = require('./cache');

const USER_SUB_PREFIX = 'user:subscription:';
const USER_PERMISSIONS_PREFIX = 'user:permissions:';
const CACHE_TTL = 1800; // 30 phút

/**
 * Lấy user subscription từ cache hoặc database
 */
const getCachedUserSubscription = async (userId, fetchFunction) => {
  try {
    const cacheKey = `${USER_SUB_PREFIX}${userId}`;
    
    // Thử lấy từ cache
    const cached = await cache.getCache(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Nếu không có trong cache, fetch từ database
    const data = await fetchFunction();
    
    // Lưu vào cache
    if (data) {
      await cache.setCache(cacheKey, JSON.stringify(data), CACHE_TTL);
    }
    
    return data;
  } catch (error) {
    console.error('User subscription cache error:', error);
    // Fallback về database nếu cache fail
    return await fetchFunction();
  }
};

/**
 * Lấy user permissions từ cache hoặc database
 */
const getCachedUserPermissions = async (userId, fetchFunction) => {
  try {
    const cacheKey = `${USER_PERMISSIONS_PREFIX}${userId}`;
    
    // Thử lấy từ cache
    const cached = await cache.getCache(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Nếu không có trong cache, fetch từ database
    const data = await fetchFunction();
    
    // Lưu vào cache
    if (data) {
      await cache.setCache(cacheKey, JSON.stringify(data), CACHE_TTL);
    }
    
    return data;
  } catch (error) {
    console.error('User permissions cache error:', error);
    // Fallback về database nếu cache fail
    return await fetchFunction();
  }
};

/**
 * Invalidate cache cho user subscription
 */
const invalidateUserSubscriptionCache = async (userId) => {
  try {
    if (userId) {
      await cache.invalidateCache(`${USER_SUB_PREFIX}${userId}`);
      await cache.invalidateCache(`${USER_PERMISSIONS_PREFIX}${userId}`);
    } else {
      // Xóa tất cả user subscription cache
      await cache.invalidateCache(`${USER_SUB_PREFIX}*`);
      await cache.invalidateCache(`${USER_PERMISSIONS_PREFIX}*`);
    }
  } catch (error) {
    console.error('User subscription cache invalidation error:', error);
  }
};

module.exports = {
  getCachedUserSubscription,
  getCachedUserPermissions,
  invalidateUserSubscriptionCache,
  USER_SUB_PREFIX,
  USER_PERMISSIONS_PREFIX
};

