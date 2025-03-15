const cron = require('node-cron');
const { User } = require('./models/User'); // Đảm bảo rằng model User được import đúng

// Lập lịch cron để cập nhật count_promt mỗi đêm lúc 0h
cron.schedule('0 0 * * *', async () => {
    try {
        // Cập nhật count_promt của tất cả user về 5
        await User.update(
            { count_promt: 5 }, // Cập nhật giá trị mới
            { where: {account_status: 1} } // Cập nhật cho tất cả người dùng
        );
        console.log('Successfully reset count_promt for all users.');
    } catch (error) {
        console.error('Error resetting count_promt for all users:', error);
    }
});

