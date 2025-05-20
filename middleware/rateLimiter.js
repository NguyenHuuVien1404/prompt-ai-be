const cache = require('../utils/cache');

/**
 * Middleware Rate Limiter sử dụng Redis cho distributed environment
 * Hỗ trợ nhiều tier rate limit tùy thuộc vào loại endpoint
 */
const createRateLimiter = (options = {}) => {
    const {
        // Số request tối đa trong khoảng thời gian
        maxRequests = 60,

        // Thời gian (giây) để reset counter
        windowSizeInSeconds = 60,

        // Key prefix để phân biệt các loại rate limit khác nhau
        keyPrefix = 'ratelimit',

        // Message khi quá rate limit
        message = 'Too many requests, please try again later.',

        // Hàm tùy chỉnh để lấy identifier (mặc định là IP)
        getIdentifier = (req) => req.ip || req.connection.remoteAddress,

        // Có gửi X-RateLimit-* headers không
        sendHeaders = true
    } = options;

    return async (req, res, next) => {
        // Bỏ qua rate limit cho các endpoint static resources
        if (req.path.startsWith('/uploads/') || req.path.startsWith('/static/')) {
            return next();
        }

        // Lấy identifier (thường là IP)
        const identifier = getIdentifier(req);

        // Tạo key dựa trên identifier và route pattern
        // Sử dụng route pattern thay vì path để đảm bảo các path với params khác nhau cùng thuộc về một rule
        const routePattern = req.route ? req.route.path : req.path;
        const key = `${keyPrefix}:${identifier}:${routePattern}`;

        try {
            // Lấy số lượng request hiện tại
            let currentRequests = await cache.getCache(key);
            currentRequests = currentRequests ? parseInt(currentRequests, 10) : 0;

            // Lấy thời gian TTL còn lại
            const ttl = await cache.getTTL(key);
            const timeWindow = ttl > 0 ? ttl : windowSizeInSeconds;

            // Kiểm tra nếu đã vượt quá giới hạn
            if (currentRequests >= maxRequests) {
                if (sendHeaders) {
                    res.set({
                        'X-RateLimit-Limit': maxRequests,
                        'X-RateLimit-Remaining': 0,
                        'X-RateLimit-Reset': timeWindow,
                        'Retry-After': timeWindow
                    });
                }

                // return res.status(429).json({
                //     error: 'Rate limit exceeded',
                //     message,
                //     retryAfter: timeWindow
                // });                
                // Bỏ qua việc trả về lỗi 429 và cho phép request tiếp tục
                return next();
            }

            // Tăng counter và set TTL nếu là request đầu tiên
            const newCount = currentRequests + 1;
            if (currentRequests === 0) {
                await cache.setCache(key, newCount.toString(), windowSizeInSeconds);
            } else {
                await cache.incrementCache(key);
            }

            // Gửi headers rate limit
            if (sendHeaders) {
                res.set({
                    'X-RateLimit-Limit': maxRequests,
                    'X-RateLimit-Remaining': Math.max(0, maxRequests - newCount),
                    'X-RateLimit-Reset': timeWindow
                });
            }

            next();
        } catch (error) {
            console.error('Rate limiter error:', error);
            // Nếu có lỗi với Redis, fallback về cho phép request (fail open)
            next();
        }
    };
};

// API Rate Limiter (60 requests/phút)
const apiLimiter = createRateLimiter({
    maxRequests: 60,
    windowSizeInSeconds: 60,
    keyPrefix: 'ratelimit:api'
});

// Auth Rate Limiter (20 requests/phút) - cho login, register, etc.
const authLimiter = createRateLimiter({
    maxRequests: 20,
    windowSizeInSeconds: 60,
    keyPrefix: 'ratelimit:auth'
});

// Upload Rate Limiter (10 requests/phút) - cho upload files
const uploadLimiter = createRateLimiter({
    maxRequests: 10,
    windowSizeInSeconds: 60,
    keyPrefix: 'ratelimit:upload'
});

// Payment API Rate Limiter (30 requests/phút)
const paymentLimiter = createRateLimiter({
    maxRequests: 30,
    windowSizeInSeconds: 60,
    keyPrefix: 'ratelimit:payment'
});

module.exports = {
    apiLimiter,
    authLimiter,
    uploadLimiter,
    paymentLimiter,
    createRateLimiter
}; 