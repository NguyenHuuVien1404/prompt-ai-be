const cache = require('./cache');
const crypto = require('crypto');

const CATEGORY_CACHE_PREFIX = 'categories:';
const CATEGORY_DETAIL_PREFIX = 'category:detail:';
const CACHE_TTL = 3600; // 1 giờ cho categories (ít thay đổi)

/**
 * Tạo cache key từ query parameters
 */
const createCacheKey = (prefix, params) => {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}:${params[key]}`)
    .join(':');
  
  // Hash nếu key quá dài
  if (sortedParams.length > 200) {
    const hash = crypto.createHash('md5').update(sortedParams).digest('hex');
    return `${prefix}${hash}`;
  }
  
  return `${prefix}${sortedParams}`;
};

/**
 * Lấy categories từ cache hoặc database
 */
const getCachedCategories = async (cacheKey, fetchFunction) => {
  try {
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
    console.error('Category cache error:', error);
    // Fallback về database nếu cache fail
    return await fetchFunction();
  }
};

/**
 * Lấy category detail từ cache hoặc database
 */
const getCachedCategoryDetail = async (categoryId, fetchFunction) => {
  try {
    const cacheKey = `${CATEGORY_DETAIL_PREFIX}${categoryId}`;
    
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
    console.error('Category cache error:', error);
    // Fallback về database nếu cache fail
    return await fetchFunction();
  }
};

/**
 * Invalidate cache cho categories
 */
const invalidateCategoryCache = async (categoryId = null) => {
  try {
    if (categoryId) {
      // Xóa cache detail của category cụ thể
      await cache.invalidateCache(`${CATEGORY_DETAIL_PREFIX}${categoryId}`);
    }
    // Xóa tất cả cache list categories
    await cache.invalidateCache(`${CATEGORY_CACHE_PREFIX}*`);
  } catch (error) {
    console.error('Category cache invalidation error:', error);
  }
};

module.exports = {
  createCacheKey,
  getCachedCategories,
  getCachedCategoryDetail,
  invalidateCategoryCache,
  CATEGORY_CACHE_PREFIX,
  CATEGORY_DETAIL_PREFIX
};

