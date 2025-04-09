const { blockedIPs } = require('../config/security');
const cache = require('../utils/cache');

// In-memory cache cho rate limiting (reset mỗi phút)
const requestCounter = new Map();
const INTERVAL = 60 * 1000; // 1 phút
const MAX_REQUESTS_PER_IP = 500; // 500 requests/phút/IP

// Clear counter
setInterval(() => {
  requestCounter.clear();
}, INTERVAL);

const ddosProtection = async (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  // Kiểm tra IP có trong cache "ban list" Redis
  const isBanned = await cache.getCache(`banned_ip:${clientIP}`);
  if (isBanned) {
    return res.status(403).json({ message: 'Truy cập bị từ chối', code: 'IP_BANNED' });
  }

  // Kiểm tra IP có trong danh sách chặn cố định
  if (blockedIPs.includes(clientIP)) {
    return res.status(403).json({ message: 'Truy cập bị từ chối', code: 'IP_BLOCKED' });
  }

  // Kiểm tra User-Agent
  const userAgent = req.headers['user-agent'] || '';
  if (!userAgent || userAgent.length < 10) {
    return res.status(403).json({ message: 'Truy cập bị từ chối', code: 'INVALID_USER_AGENT' });
  }

  // Rate limiting
  const currentCount = requestCounter.get(clientIP) || 0;

  if (currentCount > MAX_REQUESTS_PER_IP) {
    // Ban IP tạm thời (30 phút) nếu gửi quá nhiều requests
    await cache.setCache(`banned_ip:${clientIP}`, '1', 30 * 60);
    return res.status(429).json({
      message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 30 phút.',
      code: 'TOO_MANY_REQUESTS'
    });
  }

  // Tăng counter
  requestCounter.set(clientIP, currentCount + 1);

  next();
};

module.exports = ddosProtection;