const { blockedIPs } = require('../config/security');

const ddosProtection = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // Kiểm tra IP có trong danh sách chặn không
  if (blockedIPs.includes(clientIP)) {
    return res.status(403).json({ message: 'Truy cập bị từ chối' });
  }
  
  // Kiểm tra User-Agent
  const userAgent = req.headers['user-agent'] || '';
  if (!userAgent || userAgent.length < 10) {
    return res.status(403).json({ message: 'Truy cập bị từ chối' });
  }
  
  next();
};

module.exports = ddosProtection;