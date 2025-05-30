const UserSub = require('../models/UserSub');
const { Op } = require('sequelize');

const checkSubTypeAccess = async (req, res, next) => {
    try {
        console.log('=== Debug checkSubTypeAccess ===');
        console.log('User info:', {
            id: req.user.id,
            role: req.user.role,
            isAdmin: req.user.role === 2
        });

        // Nếu là admin (role = 2), cho phép xem tất cả prompts
        if (req.user.role === 2) {
            console.log('User is admin, allowing access to all prompts');
            req.subTypeAccess = [1, 2];
            return next();
        }

        // Lấy user_id từ token (giả sử đã được set bởi authMiddleware)
        const user_id = req.user.id;

        // Tìm subscription của user
        const userSub = await UserSub.findOne({
            where: { 
                user_id: user_id,
                status: 1, // Chỉ lấy subscription đang hoạt động
                end_date: {
                    [Op.gt]: new Date() // Chỉ lấy subscription chưa hết hạn
                }
            },
            order: [['end_date', 'DESC']] // Lấy subscription mới nhất
        });

        console.log('User subscription:', userSub ? {
            sub_id: userSub.sub_id,
            status: userSub.status,
            end_date: userSub.end_date
        } : 'No active subscription found');

        // Nếu không tìm thấy subscription, chỉ cho phép xem sub_type = 1
        if (!userSub) {
            console.log('No subscription found, restricting to sub_type = 1');
            req.subTypeAccess = 1;
            return next();
        }

        // Chỉ khi sub_id = 3 mới cho phép xem cả sub_type 1 và 2
        if (userSub.sub_id === 3) {
            console.log('User has sub_id = 3, allowing access to sub_type = [1, 2]');
            req.subTypeAccess = [1, 2];
        } else {
            // Các sub_id khác chỉ được xem sub_type = 1
            console.log(`User has sub_id = ${userSub.sub_id}, restricting to sub_type = 1`);
            req.subTypeAccess = 1;
        }

        console.log('Final subTypeAccess:', req.subTypeAccess);
        next();
    } catch (error) {
        console.error('Error in checkSubTypeAccess:', error);
        res.status(500).json({ message: 'Error checking subscription access' });
    }
};

module.exports = checkSubTypeAccess; 