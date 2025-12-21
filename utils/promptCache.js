const cache = require('./cache');
const crypto = require('crypto');

const PROMPT_CACHE_PREFIX = 'prompts:';
const PROMPT_DETAIL_PREFIX = 'prompt:detail:';
const CACHE_TTL = 300; // 5 phút cho list
const DETAIL_CACHE_TTL = 600; // 10 phút cho detail

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
 * Lấy prompts từ cache hoặc database
 */
const getCachedPrompts = async (cacheKey, fetchFunction) => {
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
    console.error('Cache error:', error);
    // Fallback về database nếu cache fail
    return await fetchFunction();
  }
};

/**
 * Lấy prompt detail từ cache hoặc database
 */
const getCachedPromptDetail = async (promptId, fetchFunction) => {
  try {
    const cacheKey = `${PROMPT_DETAIL_PREFIX}${promptId}`;
    
    // Thử lấy từ cache
    const cached = await cache.getCache(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Nếu không có trong cache, fetch từ database
    const data = await fetchFunction();
    
    // Lưu vào cache
    if (data) {
      await cache.setCache(cacheKey, JSON.stringify(data), DETAIL_CACHE_TTL);
    }
    
    return data;
  } catch (error) {
    console.error('Cache error:', error);
    // Fallback về database nếu cache fail
    return await fetchFunction();
  }
};

/**
 * Invalidate cache cho prompts
 */
const invalidatePromptCache = async (promptId = null) => {
  try {
    if (promptId) {
      // Xóa cache detail của prompt cụ thể
      await cache.invalidateCache(`${PROMPT_DETAIL_PREFIX}${promptId}`);
    }
    // Xóa tất cả cache list prompts
    await cache.invalidateCache(`${PROMPT_CACHE_PREFIX}*`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
};

module.exports = {
  createCacheKey,
  getCachedPrompts,
  getCachedPromptDetail,
  invalidatePromptCache,
  PROMPT_CACHE_PREFIX,
  PROMPT_DETAIL_PREFIX
};

