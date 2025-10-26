#!/usr/bin/env node

/**
 * Script đơn giản để quản lý duplicate UserSubs
 * Usage: node scripts/duplicates.js [command] [user_id]
 */

require("dotenv").config();
const sequelize = require("../config/database");

function showHelp() {
  console.log("🚀 DUPLICATE USERSUBS MANAGER");
  console.log("=".repeat(50));
  console.log("\nUsage: node scripts/duplicates.js [command] [user_id]");
  console.log("\nCommands:");
  console.log(
    "  check                    - Kiểm tra users có duplicate subscriptions"
  );
  console.log("  fix-user <user_id>       - Fix user cụ thể");
  console.log("  dry-run                  - Dry run để xem sẽ fix gì");
  console.log("\nExamples:");
  console.log("  node scripts/duplicates.js check");
  console.log("  node scripts/duplicates.js fix-user 2012");
  console.log("  node scripts/duplicates.js dry-run");
}

async function checkDuplicates() {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connected");

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
    console.log("   node scripts/duplicates.js fix-user <user_id>");
  } catch (error) {
    console.error("💥 Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("🔌 Database connection closed");
  }
}

async function fixUser(userId) {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connected");

    if (!userId) {
      console.error("❌ Please provide user ID");
      console.log("Usage: node scripts/duplicates.js fix-user <user_id>");
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

async function dryRun() {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connected");

    console.log("🔍 DRY RUN MODE - No changes will be made");

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

    // Show summary
    console.log("\n📋 DRY RUN SUMMARY:");
    console.log("=".repeat(60));
    results.forEach((user, index) => {
      const subscriptions = user.subscriptions_info.split("|");
      const keepCount = 1;
      const deactivateCount = subscriptions.length - 1;
      console.log(
        `${index + 1}. User ${user.user_id} (${
          user.email
        }): Keep ${keepCount}, Deactivate ${deactivateCount}`
      );
    });

    console.log(`\n⚠️  This would affect ${results.length} users:`);
    console.log(`   ✅ Keep: ${results.length} subscription(s) (newest)`);
    console.log(
      `   ❌ Deactivate: ${results.reduce(
        (sum, user) => sum + user.active_subscriptions_count - 1,
        0
      )} subscription(s) (older)`
    );

    console.log("\n💡 To apply changes, run:");
    console.log("   node scripts/duplicates.js fix-user <user_id>");
  } catch (error) {
    console.error("💥 Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    console.log("🔌 Database connection closed");
  }
}

// Main execution
async function main() {
  const command = process.argv[2];
  const userId = process.argv[3];

  if (!command) {
    showHelp();
  } else {
    switch (command) {
      case "check":
        await checkDuplicates();
        break;
      case "fix-user":
        await fixUser(userId);
        break;
      case "dry-run":
        await dryRun();
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  }
}

// Run the script
main().catch((error) => {
  console.error(`💥 Unhandled error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
