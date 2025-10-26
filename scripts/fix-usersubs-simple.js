#!/usr/bin/env node

/**
 * Simple script để fix duplicate UserSubs
 * Usage: node scripts/fix-usersubs-simple.js
 */

require("dotenv").config();
const sequelize = require("../config/database");
const { User, UserSub, Subscription } = require("../models");

async function fixDuplicateUserSubs() {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Sử dụng raw query để tìm users có duplicate subscriptions
    console.log("🔍 Finding users with duplicate active subscriptions...");

    const [results] = await sequelize.query(`
      SELECT 
        u.id as user_id,
        u.email,
        u.full_name,
        COUNT(us.id) as active_subscriptions_count,
        GROUP_CONCAT(
          CONCAT(us.id, ':', s.name_sub, ':', s.type, ':', us.token) 
          ORDER BY us.id DESC 
          SEPARATOR '|'
        ) as subscriptions_info
      FROM Users u
      INNER JOIN UserSubs us ON u.id = us.user_id
      INNER JOIN Subscriptions s ON us.sub_id = s.id
      WHERE us.status = 1
      GROUP BY u.id, u.email, u.full_name
      HAVING COUNT(us.id) > 1
      ORDER BY u.id ASC
    `);

    console.log(
      `📊 Found ${results.length} users with duplicate subscriptions`
    );

    if (results.length === 0) {
      console.log("🎉 No duplicate subscriptions found!");
      return;
    }

    let fixedCount = 0;
    let deactivatedCount = 0;

    // Fix từng user
    for (const user of results) {
      console.log(`\n👤 User ${user.user_id} (${user.email}):`);

      // Parse subscriptions info
      const subscriptions = user.subscriptions_info.split("|");

      // Giữ lại subscription đầu tiên (ID cao nhất), deactivate các subscription còn lại
      const keepSubscription = subscriptions[0];
      const deactivateSubscriptions = subscriptions.slice(1);

      const [keepId, keepName, keepType, keepToken] =
        keepSubscription.split(":");

      console.log(`   📋 Total active: ${subscriptions.length}`);
      console.log(`   ✅ Keeping: ${keepName} (ID: ${keepId})`);
      console.log(
        `   ❌ Deactivating: ${deactivateSubscriptions.length} subscription(s)`
      );

      // Vô hiệu hóa các subscription cũ
      for (const subInfo of deactivateSubscriptions) {
        const [subId, subName, subType, subToken] = subInfo.split(":");

        // Update status to 0 (inactive)
        await sequelize.query("UPDATE UserSubs SET status = 0 WHERE id = ?", {
          replacements: [subId],
        });

        deactivatedCount++;
        console.log(`      - Deactivated ${subName} (ID: ${subId})`);
      }

      fixedCount++;
    }

    console.log(`\n🎉 COMPLETED!`);
    console.log(`✅ Users fixed: ${fixedCount}`);
    console.log(`❌ Subscriptions deactivated: ${deactivatedCount}`);
  } catch (error) {
    console.error("💥 Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("🔌 Database connection closed");
  }
}

// Run the script
fixDuplicateUserSubs();
