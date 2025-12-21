const cache = require('./cache');

const OTP_EXPIRY_SECONDS = 600; // 10 phút
const OTP_PREFIX = 'otp:';

/**
 * Lưu OTP vào Redis và Database (dual-write)
 * @param {string} email - Email của user
 * @param {string} otp - Mã OTP
 * @param {Object} userModel - Sequelize user model instance (optional, để lưu vào DB)
 * @returns {Promise<boolean>}
 */
const saveOtp = async (email, otp, userModel = null) => {
  try {
    // Lưu vào Redis
    await cache.setCache(`${OTP_PREFIX}${email}`, otp, OTP_EXPIRY_SECONDS);
    
    // Lưu vào Database nếu có userModel (backward compatible)
    if (userModel) {
      userModel.otp_code = otp;
      userModel.otp_expires_at = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);
      await userModel.save();
    }
    
    return true;
  } catch (error) {
    console.error('Error saving OTP:', error);
    // Nếu Redis fail, vẫn lưu vào DB
    if (userModel) {
      try {
        userModel.otp_code = otp;
        userModel.otp_expires_at = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);
        await userModel.save();
      } catch (dbError) {
        console.error('Error saving OTP to database:', dbError);
        return false;
      }
    }
    return false;
  }
};

/**
 * Lấy OTP từ Redis hoặc Database (dual-read)
 * @param {string} email - Email của user
 * @param {Object} userModel - Sequelize user model instance (optional, để fallback về DB)
 * @returns {Promise<string|null>}
 */
const getOtp = async (email, userModel = null) => {
  try {
    // Đọc từ Redis trước
    let otp = await cache.getCache(`${OTP_PREFIX}${email}`);
    
    // Nếu không có trong Redis, fallback về Database
    if (!otp && userModel) {
      // Kiểm tra OTP trong DB và còn hạn
      if (userModel.otp_code && userModel.otp_expires_at) {
        const expiresAt = new Date(userModel.otp_expires_at);
        if (new Date() < expiresAt) {
          otp = userModel.otp_code;
          // Migrate OTP từ DB sang Redis
          await cache.setCache(`${OTP_PREFIX}${email}`, otp, OTP_EXPIRY_SECONDS);
        }
      }
    }
    
    return otp;
  } catch (error) {
    console.error('Error getting OTP:', error);
    // Fallback về Database
    if (userModel && userModel.otp_code && userModel.otp_expires_at) {
      const expiresAt = new Date(userModel.otp_expires_at);
      if (new Date() < expiresAt) {
        return userModel.otp_code;
      }
    }
    return null;
  }
};

/**
 * Xóa OTP từ Redis và Database
 * @param {string} email - Email của user
 * @param {Object} userModel - Sequelize user model instance (optional)
 * @returns {Promise<boolean>}
 */
const deleteOtp = async (email, userModel = null) => {
  try {
    // Xóa từ Redis
    await cache.invalidateCache(`${OTP_PREFIX}${email}`);
    
    // Xóa từ Database nếu có userModel
    if (userModel) {
      userModel.otp_code = null;
      userModel.otp_expires_at = null;
      await userModel.save();
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting OTP:', error);
    // Vẫn xóa trong DB nếu Redis fail
    if (userModel) {
      try {
        userModel.otp_code = null;
        userModel.otp_expires_at = null;
        await userModel.save();
      } catch (dbError) {
        console.error('Error deleting OTP from database:', dbError);
        return false;
      }
    }
    return false;
  }
};

/**
 * Kiểm tra OTP có hợp lệ không
 * @param {string} email - Email của user
 * @param {string} inputOtp - OTP người dùng nhập
 * @param {Object} userModel - Sequelize user model instance (optional)
 * @returns {Promise<boolean>}
 */
const verifyOtp = async (email, inputOtp, userModel = null) => {
  try {
    const storedOtp = await getOtp(email, userModel);
    
    if (!storedOtp) {
      return false;
    }
    
    // So sánh OTP
    if (storedOtp !== inputOtp) {
      return false;
    }
    
    // Xóa OTP sau khi verify thành công
    await deleteOtp(email, userModel);
    
    return true;
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return false;
  }
};

module.exports = {
  saveOtp,
  getOtp,
  deleteOtp,
  verifyOtp,
  OTP_EXPIRY_SECONDS
};

