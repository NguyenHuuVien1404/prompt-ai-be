const cron = require('node-cron');
const { User } = require('./models');
const UserSub = require('./models/UserSub');
const Subscription = require('./models/Subscription');
const { Op } = require('sequelize');

// Lập lịch cron để cập nhật count_promt mỗi đêm lúc 0h
cron.schedule('0 0 1 * *    ', async () => {
    try {
        // Cập nhật count_promt của tất cả user về 5
        await User.update(
            { count_promt: 5 }, // Cập nhật giá trị mới
            { where: { account_status: 1 } } // Cập nhật cho tất cả người dùng có account_status = 1
        );
        console.log('✅ Đã reset count_promt cho tất cả users');
    } catch (error) {
        console.error('Error resetting count_promt for all users:', error);
    }
});

// Lập lịch cron để kiểm tra subscription hết hạn mỗi đêm lúc 12h
cron.schedule('0 0 * * *', async () => {
    try {
        console.log('🔄 Bắt đầu kiểm tra subscription hết hạn...');
        
        // Tìm tất cả subscription đã hết hạn
        const expiredUserSubs = await UserSub.findAll({
            where: {
                status: 1, // Chỉ kiểm tra subscription đang active
                end_date: {
                    [Op.lt]: new Date() // end_date < current date
                }
            },
            include: [User]
        });

        console.log(`📊 Tìm thấy ${expiredUserSubs.length} subscription hết hạn`);

        // Lấy free subscription (type = 1)
        const freeSubscription = await Subscription.findOne({ 
            where: { type: 1 }, 
            attributes: ["id", "duration"]
        });

        if (!freeSubscription) {
            console.error('❌ Không tìm thấy free subscription (type = 1)');
            return;
        }

        let resetCount = 0;
        for (const userSub of expiredUserSubs) {
            try {
                // Chỉ cập nhật sub_id về free subscription
                await userSub.update({
                    sub_id: freeSubscription.id
                });

                // Reset count_promt về 5 cho user có subscription hết hạn
                await User.update(
                    { count_promt: 15 },
                    { where: { id: userSub.user_id } }
                );

                resetCount++;
                console.log(`✅ Đã reset subscription (sub_id) và count_promt cho user ${userSub.user_id} (${userSub.User?.email || 'Unknown'})`);
            } catch (error) {
                console.error(`❌ Lỗi khi reset subscription cho user ${userSub.user_id}:`, error.message);
            }
        }

        console.log(`🎉 Hoàn thành! Đã reset ${resetCount}/${expiredUserSubs.length} subscription hết hạn`);
    } catch (error) {
        console.error('❌ Lỗi khi kiểm tra subscription hết hạn:', error);
    }
});
