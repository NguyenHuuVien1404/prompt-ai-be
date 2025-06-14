const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
const Payment = require('../models/Payment');
const User = require('../models/User');



// Lấy danh sách tất cả coupons (có phân trang, tìm kiếm và thống kê)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 10, search, status, type, include_stats = false } = req.query;
        const offset = (page - 1) * limit;

        // Xây dựng điều kiện tìm kiếm
        const where = {};
        if (search) {
            where[Op.or] = [
                { code: { [Op.like]: `%${search}%` } }
            ];
        }
        if (status) {
            where.is_active = status === 'active';
        }
        if (type) {
            where.type = type;
        }

        // Nếu không cần thống kê, chỉ lấy danh sách coupons
        if (!include_stats) {
            const { count, rows: coupons } = await Coupon.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: parseInt(offset),
                order: [['created_at', 'DESC']]
            });

            return res.json({
                success: true,
                data: {
                    list: coupons,
                    pagination: {
                        total: count,
                        page: parseInt(page),
                        limit: parseInt(limit),
                        totalPages: Math.ceil(count / limit)
                    }
                }
            });
        }

        // Nếu cần thống kê, lấy thông tin chi tiết
        console.log('🔍 Bắt đầu lấy thống kê coupon usage');

        // 1. Lấy toàn bộ coupons với điều kiện tìm kiếm
        const coupons = await Coupon.findAll({
            where,
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['created_at', 'DESC']],
            raw: true
        });

        // 2. Lấy payment có status = SUCCESS + coupon_id + full_name
        const successfulPayments = await Payment.findAll({
            attributes: ['coupon_id'],
            where: {
                payment_status: 'SUCCESS',
                coupon_id: { [Op.not]: null }
            },
            include: [{
                model: User,
                attributes: ['full_name']
            }],
            raw: true,
            nest: true
        });

        // 3. Group theo coupon_id để đếm số lần sử dụng
        const couponToCount = {};
        successfulPayments.forEach(p => {
            const couponId = p.coupon_id;
            if (!couponId) return;
            couponToCount[couponId] = (couponToCount[couponId] || 0) + 1;
        });

        // 4. Merge vào coupons
        const formattedStats = coupons.map(c => {
            const count = couponToCount[c.id] || 0;
            // Tính usage %
            const usage_percentage = (c.max_usage && c.max_usage > 0)
                ? Number(((c.usage_count / c.max_usage) * 100).toFixed(2))
                : null;

            return {
                ...c,
                usage_percentage,
                count
            };
        });

        // 5. Lấy tổng số coupons cho phân trang
        const total = await Coupon.count({ where });

        res.json({
            success: true,
            data: {
                list: formattedStats,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('❌ Lỗi khi lấy danh sách coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách coupons',
            error: error.message
        });
    }
});

// Lấy chi tiết một coupon
router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const coupon = await Coupon.findByPk(req.params.id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy coupon',
                error: 'NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: coupon
        });
    } catch (error) {
        console.error('Lỗi khi lấy chi tiết coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy chi tiết coupon',
            error: error.message
        });
    }
});

// Tạo coupon mới
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const couponData = req.body;
        
        // Validate dữ liệu
        if (!couponData.code || !couponData.discount || !couponData.type) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Thiếu thông tin bắt buộc',
                error: 'INVALID_DATA'
            });
        }

        // Kiểm tra code đã tồn tại chưa
        const existingCoupon = await Coupon.findOne({
            where: { code: couponData.code }
        });

        if (existingCoupon) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Mã coupon đã tồn tại',
                error: 'DUPLICATE_CODE'
            });
        }

        // Tạo coupon mới
        const coupon = await Coupon.create(couponData, { transaction: t });
        await t.commit();

        res.status(201).json({
            success: true,
            message: 'Tạo coupon thành công',
            data: coupon
        });
    } catch (error) {
        await t.rollback();
        console.error('Lỗi khi tạo coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo coupon',
            error: error.message
        });
    }
});

// Cập nhật coupon
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const coupon = await Coupon.findByPk(req.params.id, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!coupon) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy coupon',
                error: 'NOT_FOUND'
            });
        }

        // Lưu thông tin cũ
        const oldData = { ...coupon.toJSON() };

        // Cập nhật coupon
        await coupon.update(req.body, { transaction: t });
        
        // Reload lại dữ liệu mới nhất từ database
        await coupon.reload({ transaction: t });
        const newData = coupon.toJSON();

        await t.commit();

        res.json({
            success: true,
            message: 'Cập nhật coupon thành công',
            data: {
                id: coupon.id,
                code: coupon.code,
                old_data: oldData,
                new_data: newData,
                updated_at: new Date()
            }
        });
    } catch (error) {
        await t.rollback();
        console.error('Lỗi khi cập nhật coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật coupon',
            error: error.message
        });
    }
});

// Xóa coupon
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const coupon = await Coupon.findByPk(req.params.id, {
            transaction: t,
            lock: t.LOCK.UPDATE
        });

        if (!coupon) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy coupon',
                error: 'NOT_FOUND'
            });
        }

        const deletedCoupon = { ...coupon.toJSON() };
        await coupon.destroy({ transaction: t });
        await t.commit();

        res.json({
            success: true,
            message: 'Xóa coupon thành công',
            data: {
                id: deletedCoupon.id,
                code: deletedCoupon.code,
                deleted_at: new Date()
            }
        });
    } catch (error) {
        await t.rollback();
        console.error('Lỗi khi xóa coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa coupon',
            error: error.message
        });
    }
});

// Kiểm tra tính hợp lệ của coupon
router.post('/validate', async (req, res) => {
    try {
        const { code, total } = req.body;

        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập mã coupon',
                error: 'MISSING_CODE'
            });
        }

        // Tìm coupon theo code
        const coupon = await Coupon.findOne({
            where: { code }
        });

        // Kiểm tra coupon có tồn tại
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Mã coupon không tồn tại',
                error: 'INVALID_CODE'
            });
        }

        // Kiểm tra coupon có active không
        if (!coupon.is_active) {
            return res.status(400).json({
                success: false,
                message: 'Mã coupon đã bị vô hiệu hóa',
                error: 'INACTIVE_COUPON'
            });
        }

        // Kiểm tra hạn sử dụng
        if (coupon.expiry_date) {
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time to start of day
            
            const expiryDate = new Date(coupon.expiry_date);
            expiryDate.setHours(0, 0, 0, 0); // Reset time to start of day

            // Nếu ngày tạo sau ngày hết hạn, sử dụng ngày tạo làm ngày bắt đầu
            const startDate = new Date(coupon.created_at);
            startDate.setHours(0, 0, 0, 0);

            // Kiểm tra nếu ngày hiện tại nằm trong khoảng từ ngày tạo đến ngày hết hạn
            if (today < startDate || today > expiryDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Mã coupon chưa đến thời gian sử dụng hoặc đã hết hạn',
                    error: 'EXPIRED_COUPON'
                });
            }
        }

        // Kiểm tra số lần sử dụng
        if (coupon.max_usage && coupon.usage_count >= coupon.max_usage) {
            return res.status(400).json({
                success: false,
                message: 'Mã coupon đã hết lượt sử dụng',
                error: 'MAX_USAGE_REACHED'
            });
        }

        // Tính discount_amount và final_price nếu có total
        let discount_amount = 0;
        let final_price = null;
        if (total !== undefined && total !== null) {
            if (coupon.type === 'percent') {
                discount_amount = Math.round((total * coupon.discount) / 100);
                final_price = total - discount_amount;
            } else if (coupon.type === 'fixed') {
                discount_amount = coupon.discount;
                final_price = total - discount_amount;
            }
            if (final_price < 0) final_price = 0;
        }

        // Nếu tất cả điều kiện đều hợp lệ
        res.json({
            success: true,
            message: 'Mã coupon hợp lệ',
            data: {
                id: coupon.id,
                code: coupon.code,
                type: coupon.type,
                discount: coupon.discount,
                discount_amount,
                final_price
            }
        });
    } catch (error) {
        console.error('❌ Lỗi khi kiểm tra coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra coupon',
            error: error.message
        });
    }
});

// Lấy danh sách user sử dụng coupon (có phân trang)
router.get('/:id/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        const couponId = req.params.id;

        // Lấy tất cả payment thành công với coupon_id này
        const payments = await Payment.findAll({
            where: {
                coupon_id: couponId,
                payment_status: 'SUCCESS'
            },
            include: [{
                model: User,
                attributes: ['id', 'full_name']
            }],
            raw: true,
            nest: true
        });

        // Nhóm theo user_id
        const userMap = {};
        payments.forEach(p => {
            const userId = p.User?.id;
            const fullName = p.User?.full_name;
            if (!userId) return;
            if (!userMap[userId]) {
                userMap[userId] = {
                    user_id: userId,
                    full_name: fullName,
                    total_payments: 0,
                    total_amount: 0,
                    last_payment_date: null,
                    last_status: null
                };
            }
            userMap[userId].total_payments += 1;
            userMap[userId].total_amount += Number(p.amount || 0);
            // Cập nhật ngày và trạng thái nếu mới hơn
            if (!userMap[userId].last_payment_date || new Date(p.payment_date) > new Date(userMap[userId].last_payment_date)) {
                userMap[userId].last_payment_date = p.payment_date;
                userMap[userId].last_status = p.payment_status;
            }
        });

        // Chuyển thành mảng và phân trang
        const users = Object.values(userMap);
        const total = users.length;
        const pagedUsers = users.slice(offset, offset + parseInt(limit));

        res.json({
            success: true,
            data: {
                list: pagedUsers,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Lỗi khi lấy danh sách user sử dụng coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách user sử dụng coupon',
            error: error.message
        });
    }
});

module.exports = router; 