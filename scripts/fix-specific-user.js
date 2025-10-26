#!/usr/bin/env node

/**
 * Script để fix duplicate UserSubs cho user cụ thể
 * Usage: node scripts/fix-specific-user.js 2012
 */

require("dotenv").config();
const sequelize = require("../config/database");

async function fixSpecificUser(userId) {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connected");

    if (!userId) {
      console.error("❌ Please provide user ID");
      console.log("Usage: node scripts/fix-specific-user.js <user_id>");
      process.exit(1);
    }

    console.log(`🎯 Fixing duplicate subscriptions for user ${userId}...`);

    // Kiểm tra user có tồn tại không
    const [userCheck] = await sequelize.query(
      "SELECT id, email, full_name FROM Users WHERE id = ?",
      { replacements: [userId] }
    );

    if (userCheck.length === 0) {
      console.error(`❌ User ${userId} not found`);
      process.exit(1);
    }

    const user = userCheck[0];
    console.log(`👤 User: ${user.email} (${user.full_name})`);

    // Tìm subscriptions active của user
    const [subscriptions] = await sequelize.query(
      `
      SELECT 
        us.id,
        us.sub_id,
        us.status,
        us.token,
        s.name_sub,
        s.type
      FROM UserSubs us
      INNER JOIN Subscriptions s ON us.sub_id = s.id
      WHERE us.user_id = ? AND us.status = 1
      ORDER BY us.id DESC
    `,
      { replacements: [userId] }
    );

    console.log(`📋 Found ${subscriptions.length} active subscriptions`);

    if (subscriptions.length <= 1) {
      console.log("✅ User has no duplicate subscriptions");
      return;
    }

    // Giữ lại subscription đầu tiên (ID cao nhất), deactivate các subscription còn lại
    const keepSubscription = subscriptions[0];
    const deactivateSubscriptions = subscriptions.slice(1);

    console.log(`\n✅ KEEPING:`);
    console.log(
      `   ID: ${keepSubscription.id} | ${keepSubscription.name_sub} | Type: ${keepSubscription.type} | Token: ${keepSubscription.token}`
    );

    console.log(`\n❌ DEACTIVATING:`);
    for (const sub of deactivateSubscriptions) {
      console.log(
        `   ID: ${sub.id} | ${sub.name_sub} | Type: ${sub.type} | Token: ${sub.token}`
      );
    }

    // Confirm before proceeding
    console.log(
      `\n⚠️  This will deactivate ${deactivateSubscriptions.length} subscription(s).`
    );
    console.log("Press Ctrl+C to cancel, or wait 5 seconds to proceed...");

    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Start transaction
    const transaction = await sequelize.transaction();

    try {
      // Deactivate old subscriptions
      for (const sub of deactivateSubscriptions) {
        await sequelize.query("UPDATE UserSubs SET status = 0 WHERE id = ?", {
          replacements: [sub.id],
          transaction,
        });
        console.log(`   ✅ Deactivated subscription ID ${sub.id}`);
      }

      await transaction.commit();
      console.log(`\n🎉 Successfully fixed user ${userId}!`);
      console.log(
        `✅ Kept: ${keepSubscription.name_sub} (ID: ${keepSubscription.id})`
      );
      console.log(
        `❌ Deactivated: ${deactivateSubscriptions.length} subscription(s)`
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("💥 Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log("🔌 Database connection closed");
  }
}

// Get user ID from command line arguments
const userId = process.argv[2];

// Run the script
fixSpecificUser(userId);
