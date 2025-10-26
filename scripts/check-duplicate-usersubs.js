#!/usr/bin/env node

/**
 * Script để kiểm tra users có duplicate UserSubs
 * Usage: node scripts/check-duplicate-usersubs.js
 */

require("dotenv").config();
const sequelize = require("../config/database");
const { User, UserSub, Subscription } = require("../models");

async function checkDuplicateUserSubs() {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connected");

    // Sử dụng raw query để tránh lỗi Sequelize
    console.log("🔍 Checking for users with duplicate active subscriptions...");

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

    // Hiển thị chi tiết từng user
    console.log("\n📋 DETAILED REPORT:");
    console.log("=".repeat(80));

    results.forEach((user, index) => {
      console.log(`\n${index + 1}. User ${user.user_id} (${user.email})`);
      console.log(`   Full Name: ${user.full_name}`);
      console.log(
        `   Active Subscriptions: ${user.active_subscriptions_count}`
      );

      // Parse subscriptions info
      const subscriptions = user.subscriptions_info.split("|");
      subscriptions.forEach((subInfo, subIndex) => {
        const [subId, subName, subType, token] = subInfo.split(":");
        const isNewest = subIndex === 0;
        const status = isNewest ? "✅ KEEP" : "❌ DEACTIVATE";
        console.log(
          `   ${status} ID: ${subId} | ${subName} | Type: ${subType} | Token: ${token}`
        );
      });
    });

    console.log("\n💡 To fix these duplicates, run:");
    console.log("   node scripts/fix-usersubs-simple.js");
  } catch (error) {
    console.error("💥 Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("🔌 Database connection closed");
  }
}

// Run the script
checkDuplicateUserSubs();
