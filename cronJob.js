const cron = require("node-cron");
const { User } = require("./models");
const UserSub = require("./models/UserSub");
const Subscription = require("./models/Subscription");
const { Op } = require("sequelize");
const { sendSubscriptionExpiringEmail } = require("./utils/emailService");

// Lập lịch cron để kiểm tra subscription hết hạn mỗi đêm lúc 12h
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("🔄 Bắt đầu kiểm tra subscription hết hạn...");

    // Tìm tất cả subscription đã hết hạn
    const expiredUserSubs = await UserSub.findAll({
      where: {
        status: 1, // Chỉ kiểm tra subscription đang active
        end_date: {
          [Op.lt]: new Date(), // end_date < current date
        },
      },
      include: [User],
    });

    console.log(`📊 Tìm thấy ${expiredUserSubs.length} subscription hết hạn`);

    // Lấy free subscription (type = 1)
    const freeSubscription = await Subscription.findOne({
      where: { type: 1 },
      attributes: ["id", "duration"],
    });

    if (!freeSubscription) {
      console.error("❌ Không tìm thấy free subscription (type = 1)");
      return;
    }

    let resetCount = 0;
    for (const userSub of expiredUserSubs) {
      try {
        // Chỉ cập nhật sub_id về free subscription
        await userSub.update({
          sub_id: freeSubscription.id,
        });

        // Reset count_promt về 15 cho user có subscription hết hạn
        await User.update(
          { count_promt: 15 },
          { where: { id: userSub.user_id } }
        );

        resetCount++;
        console.log(
          `✅ Đã reset subscription (sub_id) và count_promt cho user ${
            userSub.user_id
          } (${userSub.User?.email || "Unknown"})`
        );
      } catch (error) {
        console.error(
          `❌ Lỗi khi reset subscription cho user ${userSub.user_id}:`,
          error.message
        );
      }
    }

    console.log(
      `🎉 Hoàn thành! Đã reset ${resetCount}/${expiredUserSubs.length} subscription hết hạn`
    );
  } catch (error) {
    console.error("❌ Lỗi khi kiểm tra subscription hết hạn:", error);
  }
});

// Lập lịch cron để reset token hàng ngày cho tất cả user free lúc 12h
cron.schedule("0 0 * * *", async () => {
  try {
    console.log("🔄 Bắt đầu reset token hàng ngày cho user free...");

    // Lấy free subscription (type = 1)
    const freeSubscription = await Subscription.findOne({
      where: { type: 1 },
      attributes: ["id"],
    });

    if (!freeSubscription) {
      console.error("❌ Không tìm thấy free subscription (type = 1)");
      return;
    }

    // Tìm tất cả user có free subscription
    const freeUsers = await UserSub.findAll({
      where: {
        sub_id: freeSubscription.id,
        status: 1,
      },
      include: [User],
    });

    console.log(`📊 Tìm thấy ${freeUsers.length} user free cần reset token`);

    // Reset count_promt về 15 cho tất cả user free
    const resetResult = await User.update(
      { count_promt: 15 },
      {
        where: {
          id: {
            [Op.in]: freeUsers.map((userSub) => userSub.user_id),
          },
        },
      }
    );

    console.log(
      `🎉 Hoàn thành! Đã reset token cho ${resetResult[0]} user free`
    );
  } catch (error) {
    console.error("❌ Lỗi khi reset token hàng ngày cho user free:", error);
  }
});

// Lập lịch cron để gửi email cảnh báo cho user sắp hết hạn subscription (trong vòng 5 ngày) - chạy mỗi ngày lúc 9h sáng
cron.schedule("0 9 * * *", async () => {
  try {
    console.log("🔄 Bắt đầu kiểm tra và gửi email cảnh báo subscription sắp hết hạn...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tính ngày 5 ngày kể từ hôm nay
    const fiveDaysLater = new Date(today);
    fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);
    fiveDaysLater.setHours(23, 59, 59, 999);

    // Tính thời điểm hiện tại để loại trừ subscription đã hết hạn tại thời điểm này
    const now = new Date();

    // Tìm tất cả subscription sắp hết hạn trong vòng 5 ngày (không bao gồm đã hết hạn)
    // end_date phải >= hôm nay (00:00:00) và <= 5 ngày sau, nhưng > thời điểm hiện tại
    const expiringUserSubs = await UserSub.findAll({
      where: {
        status: 1, // Chỉ kiểm tra subscription đang active
        end_date: {
          [Op.gte]: today, // end_date >= hôm nay 00:00:00 (bao gồm cả hôm nay)
          [Op.lte]: fiveDaysLater, // end_date <= 5 ngày sau
          [Op.gt]: now, // end_date > thời điểm hiện tại (không bao gồm đã hết hạn)
        },
      },
      include: [
        {
          model: User,
          attributes: ["id", "email", "full_name"],
        },
        {
          model: Subscription,
          attributes: ["id", "name_sub"],
        },
      ],
    });

    console.log(`📊 Tìm thấy ${expiringUserSubs.length} subscription sắp hết hạn trong vòng 5 ngày`);

    if (expiringUserSubs.length === 0) {
      console.log("✅ Không có subscription nào sắp hết hạn");
      return;
    }

    let emailSentCount = 0;
    let emailFailedCount = 0;

    for (const userSub of expiringUserSubs) {
      try {
        if (!userSub.User || !userSub.Subscription) {
          console.warn(`⚠️ Thiếu thông tin user hoặc subscription cho userSub ID: ${userSub.id}`);
          continue;
        }

        // Tính số ngày còn lại (so với thời điểm hiện tại)
        const endDate = new Date(userSub.end_date);
        const daysRemaining = Math.ceil(
          (endDate - now) / (1000 * 60 * 60 * 24)
        );

        // Chỉ gửi email nếu còn từ 0 đến 5 ngày (0 = hết hạn trong ngày hôm nay)
        if (daysRemaining < 0 || daysRemaining > 5) {
          continue;
        }

        const userName = userSub.User.full_name || userSub.User.email;
        const subscriptionName = userSub.Subscription.name_sub || "Subscription";

        const result = await sendSubscriptionExpiringEmail(
          userSub.User.email,
          userName,
          subscriptionName,
          daysRemaining,
          userSub.end_date
        );

        if (result.success) {
          emailSentCount++;
          console.log(
            `✅ Đã gửi email cảnh báo cho user ${userSub.User.email} (${userName}) - Còn ${daysRemaining} ngày`
          );
        } else {
          emailFailedCount++;
          console.error(
            `❌ Lỗi khi gửi email cho user ${userSub.User.email}:`,
            result.error
          );
        }

        // Delay 1 giây giữa các email để tránh rate limit
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        emailFailedCount++;
        console.error(
          `❌ Lỗi khi xử lý subscription cho userSub ID ${userSub.id}:`,
          error.message
        );
      }
    }

    console.log(
      `🎉 Hoàn thành! Đã gửi ${emailSentCount}/${expiringUserSubs.length} email cảnh báo. Lỗi: ${emailFailedCount}`
    );
  } catch (error) {
    console.error("❌ Lỗi khi kiểm tra và gửi email cảnh báo subscription sắp hết hạn:", error);
  }
});
