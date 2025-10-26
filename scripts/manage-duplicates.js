#!/usr/bin/env node

/**
 * Script tổng hợp để quản lý duplicate UserSubs
 * Usage: node scripts/manage-duplicates.js [command] [options]
 *
 * Commands:
 *   check                    - Kiểm tra users có duplicate subscriptions
 *   fix-user <user_id>       - Fix user cụ thể
 *   fix-all                  - Fix tất cả users
 *   fix-simple               - Fix đơn giản
 *   dry-run                  - Dry run để xem sẽ fix gì
 */

require("dotenv").config();
const sequelize = require("../config/database");

// Colors for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) =>
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg) =>
    console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  header: (msg) =>
    console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`),
};

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const userId = args[1];

function showUsage() {
  log.header("🚀 DUPLICATE USERSUBS MANAGER");
  log.header("=".repeat(50));
  console.log("\nUsage: node scripts/manage-duplicates.js [command] [options]");
  console.log("\nCommands:");
  console.log(
    "  check                    - Kiểm tra users có duplicate subscriptions"
  );
  console.log("  fix-user <user_id>       - Fix user cụ thể");
  console.log("  fix-all                  - Fix tất cả users");
  console.log("  fix-simple               - Fix đơn giản");
  console.log("  dry-run                  - Dry run để xem sẽ fix gì");
  console.log("\nExamples:");
  console.log("  node scripts/manage-duplicates.js check");
  console.log("  node scripts/manage-duplicates.js fix-user 2012");
  console.log("  node scripts/manage-duplicates.js fix-all");
  console.log("  node scripts/manage-duplicates.js dry-run");
}

async function checkDuplicates() {
  try {
    log.info("🔌 Connecting to database...");
    await sequelize.authenticate();
    log.success("✅ Database connected");

    log.info("🔍 Checking for users with duplicate active subscriptions...");

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

    log.info(`📊 Found ${results.length} users with duplicate subscriptions`);

    if (results.length === 0) {
      log.success("🎉 No duplicate subscriptions found!");
      return;
    }

    // Hiển thị chi tiết từng user
    log.header("\n📋 DETAILED REPORT:");
    log.header("=".repeat(80));

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

    log.info("\n💡 To fix these duplicates, run:");
    log.info("   node scripts/manage-duplicates.js fix-all");
    log.info("   node scripts/manage-duplicates.js fix-user <user_id>");
  } catch (error) {
    log.error("💥 Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    log.info("🔌 Database connection closed");
  }
}

async function fixSpecificUser(userId) {
  try {
    log.info("🔌 Connecting to database...");
    await sequelize.authenticate();
    log.success("✅ Database connected");

    if (!userId) {
      log.error("❌ Please provide user ID");
      log.info("Usage: node scripts/manage-duplicates.js fix-user <user_id>");
      process.exit(1);
    }

    log.info(`🎯 Fixing duplicate subscriptions for user ${userId}...`);

    // Kiểm tra user có tồn tại không
    const [userCheck] = await sequelize.query(
      "SELECT id, email, full_name FROM Users WHERE id = ?",
      { replacements: [userId] }
    );

    if (userCheck.length === 0) {
      log.error(`❌ User ${userId} not found`);
      process.exit(1);
    }

    const user = userCheck[0];
    log.info(`👤 User: ${user.email} (${user.full_name})`);

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

    log.info(`📋 Found ${subscriptions.length} active subscriptions`);

    if (subscriptions.length <= 1) {
      log.success("✅ User has no duplicate subscriptions");
      return;
    }

    // Giữ lại subscription đầu tiên (ID cao nhất), deactivate các subscription còn lại
    const keepSubscription = subscriptions[0];
    const deactivateSubscriptions = subscriptions.slice(1);

    log.info(`\n✅ KEEPING:`);
    log.info(
      `   ID: ${keepSubscription.id} | ${keepSubscription.name_sub} | Type: ${keepSubscription.type} | Token: ${keepSubscription.token}`
    );

    log.info(`\n❌ DEACTIVATING:`);
    for (const sub of deactivateSubscriptions) {
      log.info(
        `   ID: ${sub.id} | ${sub.name_sub} | Type: ${sub.type} | Token: ${sub.token}`
      );
    }

    // Confirm before proceeding
    log.warning(
      `\n⚠️  This will deactivate ${deactivateSubscriptions.length} subscription(s).`
    );
    log.info("Press Ctrl+C to cancel, or wait 5 seconds to proceed...");

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
        log.success(`   ✅ Deactivated subscription ID ${sub.id}`);
      }

      await transaction.commit();
      log.success(`\n🎉 Successfully fixed user ${userId}!`);
      log.success(
        `✅ Kept: ${keepSubscription.name_sub} (ID: ${keepSubscription.id})`
      );
      log.success(
        `❌ Deactivated: ${deactivateSubscriptions.length} subscription(s)`
      );
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    log.error("💥 Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
    log.info("🔌 Database connection closed");
  }
}

async function dryRun() {
  try {
    log.info("🔌 Connecting to database...");
    await sequelize.authenticate();
    log.success("✅ Database connected");

    log.warning("🔍 DRY RUN MODE - No changes will be made");

    log.info("🔍 Finding users with duplicate active subscriptions...");

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

    log.info(`📊 Found ${results.length} users with duplicate subscriptions`);

    if (results.length === 0) {
      log.success("🎉 No duplicate subscriptions found!");
      return;
    }

    // Show summary
    log.header("\n📋 DRY RUN SUMMARY:");
    log.header("=".repeat(60));
    results.forEach((user, index) => {
      const subscriptions = user.subscriptions_info.split("|");
      const keepCount = 1;
      const deactivateCount = subscriptions.length - 1;
      log.info(
        `${index + 1}. User ${user.user_id} (${
          user.email
        }): Keep ${keepCount}, Deactivate ${deactivateCount}`
      );
    });

    log.warning(`\n⚠️  This would affect ${results.length} users:`);
    log.info(`   ✅ Keep: ${results.length} subscription(s) (newest)`);
    log.info(
      `   ❌ Deactivate: ${results.reduce(
        (sum, user) => sum + user.active_subscriptions_count - 1,
        0
      )} subscription(s) (older)`
    );

    log.info("\n💡 To apply changes, run:");
    log.info("   node scripts/manage-duplicates.js fix-all");
  } catch (error) {
    log.error("💥 Error:", error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
    log.info("🔌 Database connection closed");
  }
}

// Main execution
async function main() {
  if (!command) {
    showUsage();
    return;
  }

  switch (command) {
    case "check":
      await checkDuplicates();
      break;
    case "fix-user":
      await fixSpecificUser(userId);
      break;
    case "fix-all":
      log.info("🚀 Running fix-all-usersubs.js...");
      require("./fix-all-usersubs.js");
      break;
    case "fix-simple":
      log.info("🚀 Running fix-usersubs-simple.js...");
      require("./fix-usersubs-simple.js");
      break;
    case "dry-run":
      await dryRun();
      break;
    default:
      log.error(`❌ Unknown command: ${command}`);
      showUsage();
      process.exit(1);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  log.warning("\n⚠️  Script interrupted by user");
  try {
    await sequelize.close();
    log.info("🔌 Database connection closed");
  } catch (error) {
    log.error(`Error closing database: ${error.message}`);
  }
  process.exit(0);
});

// Run the script
main().catch((error) => {
  log.error(`💥 Unhandled error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
});
