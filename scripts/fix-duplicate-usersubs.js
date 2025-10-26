#!/usr/bin/env node

/**
 * Script để fix duplicate UserSubs trên production
 * Đảm bảo mỗi user chỉ có 1 UserSub active (status = 1)
 *
 * Usage:
 * node scripts/fix-duplicate-usersubs.js
 * node scripts/fix-duplicate-usersubs.js --dry-run
 * node scripts/fix-duplicate-usersubs.js --user-id=123
 */

const path = require("path");
const fs = require("fs");

// Add project root to require path
const projectRoot = path.join(__dirname, "..");
process.env.NODE_PATH = projectRoot;
require("module")._initPaths();

// Load environment variables
require("dotenv").config({ path: path.join(projectRoot, ".env") });

// Import models and database
const sequelize = require("../config/database");
const { User, UserSub, Subscription } = require("../models");

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
const isDryRun = args.includes("--dry-run");
const userIdArg = args.find((arg) => arg.startsWith("--user-id="));
const specificUserId = userIdArg ? parseInt(userIdArg.split("=")[1]) : null;

// Statistics
const stats = {
  totalUsersChecked: 0,
  usersWithDuplicates: 0,
  subscriptionsFixed: 0,
  subscriptionsDeactivated: 0,
  errors: 0,
  startTime: new Date(),
};

/**
 * Find users with duplicate active subscriptions
 */
async function findUsersWithDuplicates() {
  try {
    log.info("🔍 Finding users with duplicate active subscriptions...");

    let whereClause = {};
    if (specificUserId) {
      whereClause.id = specificUserId;
      log.info(`🎯 Targeting specific user ID: ${specificUserId}`);
    }

    const usersWithDuplicates = await User.findAll({
      where: whereClause,
      include: [
        {
          model: UserSub,
          where: { status: 1 },
          include: [Subscription],
          required: true, // Only users with active subscriptions
        },
      ],
      having: sequelize.literal("COUNT(UserSubs.id) > 1"),
      group: ["User.id"],
      order: [["User.id", "ASC"]],
    });

    stats.totalUsersChecked = specificUserId ? 1 : await User.count();
    stats.usersWithDuplicates = usersWithDuplicates.length;

    log.info(
      `📊 Found ${usersWithDuplicates.length} users with duplicate active subscriptions`
    );

    if (usersWithDuplicates.length === 0) {
      log.success("✅ No users with duplicate subscriptions found!");
      return [];
    }

    return usersWithDuplicates;
  } catch (error) {
    log.error(`❌ Error finding users with duplicates: ${error.message}`);
    throw error;
  }
}

/**
 * Fix duplicate subscriptions for a specific user
 */
async function fixUserDuplicates(user, isDryRun = false) {
  try {
    // Sort subscriptions by ID (newest first)
    const sortedSubscriptions = user.UserSubs.sort((a, b) => b.id - a.id);

    // Keep the newest subscription (highest ID)
    const keepSubscription = sortedSubscriptions[0];
    const deactivateSubscriptions = sortedSubscriptions.slice(1);

    log.info(`👤 User ${user.id} (${user.email}):`);
    log.info(`   📋 Total active subscriptions: ${sortedSubscriptions.length}`);
    log.info(
      `   ✅ Keeping subscription ID ${keepSubscription.id} (${
        keepSubscription.Subscription?.name_sub || "Unknown"
      })`
    );
    log.info(
      `   ❌ Will deactivate ${
        deactivateSubscriptions.length
      } subscription(s): ${deactivateSubscriptions.map((s) => s.id).join(", ")}`
    );

    if (!isDryRun) {
      // Start transaction
      const transaction = await sequelize.transaction();

      try {
        // Deactivate old subscriptions
        for (const sub of deactivateSubscriptions) {
          await sub.update({ status: 0 }, { transaction });
          stats.subscriptionsDeactivated++;
        }

        await transaction.commit();
        stats.subscriptionsFixed++;

        log.success(
          `   ✅ Fixed user ${user.id}: Deactivated ${deactivateSubscriptions.length} subscription(s)`
        );
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } else {
      log.warning(
        `   🔍 DRY RUN: Would deactivate ${deactivateSubscriptions.length} subscription(s)`
      );
    }

    return {
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      keptSubscription: {
        id: keepSubscription.id,
        subId: keepSubscription.sub_id,
        subscriptionName: keepSubscription.Subscription?.name_sub,
        subscriptionType: keepSubscription.Subscription?.type,
        status: keepSubscription.status,
        startDate: keepSubscription.start_date,
        endDate: keepSubscription.end_date,
        token: keepSubscription.token,
      },
      deactivatedSubscriptions: deactivateSubscriptions.map((sub) => ({
        id: sub.id,
        subId: sub.sub_id,
        subscriptionName: sub.Subscription?.name_sub,
        subscriptionType: sub.Subscription?.type,
      })),
      totalActiveBefore: sortedSubscriptions.length,
      totalActiveAfter: 1,
    };
  } catch (error) {
    log.error(`   ❌ Error fixing user ${user.id}: ${error.message}`);
    stats.errors++;
    throw error;
  }
}

/**
 * Generate detailed report
 */
function generateReport(results) {
  const endTime = new Date();
  const duration = Math.round((endTime - stats.startTime) / 1000);

  log.header("\n📊 FINAL REPORT");
  log.header("=".repeat(50));

  log.info(`⏱️  Execution time: ${duration} seconds`);
  log.info(`👥 Total users checked: ${stats.totalUsersChecked}`);
  log.info(`🔍 Users with duplicates: ${stats.usersWithDuplicates}`);
  log.info(`✅ Users fixed: ${stats.subscriptionsFixed}`);
  log.info(`❌ Subscriptions deactivated: ${stats.subscriptionsDeactivated}`);
  log.info(`🚨 Errors: ${stats.errors}`);

  if (results.length > 0) {
    log.header("\n📋 DETAILED RESULTS");
    log.header("-".repeat(50));

    results.forEach((result, index) => {
      log.info(`${index + 1}. User ${result.userId} (${result.email})`);
      log.info(
        `   ✅ Kept: ${result.keptSubscription.subscriptionName} (ID: ${result.keptSubscription.id})`
      );
      log.info(
        `   ❌ Deactivated: ${result.deactivatedSubscriptions.length} subscription(s)`
      );
      result.deactivatedSubscriptions.forEach((sub) => {
        log.info(`      - ${sub.subscriptionName} (ID: ${sub.id})`);
      });
    });
  }

  // Save detailed report to file
  const reportData = {
    executionTime: {
      start: stats.startTime.toISOString(),
      end: endTime.toISOString(),
      duration: `${duration} seconds`,
    },
    statistics: stats,
    results: results,
    isDryRun: isDryRun,
  };

  const reportPath = path.join(
    projectRoot,
    "logs",
    `fix-duplicate-usersubs-${Date.now()}.json`
  );

  // Ensure logs directory exists
  const logsDir = path.join(projectRoot, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  log.info(`📄 Detailed report saved to: ${reportPath}`);
}

/**
 * Main execution function
 */
async function main() {
  try {
    log.header("🚀 DUPLICATE USERSUBS FIXER");
    log.header("=".repeat(50));

    if (isDryRun) {
      log.warning("🔍 DRY RUN MODE - No changes will be made");
    }

    if (specificUserId) {
      log.info(`🎯 Targeting specific user: ${specificUserId}`);
    }

    // Connect to database
    log.info("🔌 Connecting to database...");
    await sequelize.authenticate();
    log.success("✅ Database connected successfully");

    // Find users with duplicates
    const usersWithDuplicates = await findUsersWithDuplicates();

    if (usersWithDuplicates.length === 0) {
      log.success("🎉 No duplicate subscriptions found!");
      generateReport([]);
      return;
    }

    // Fix each user
    log.info(`🔧 Starting to fix ${usersWithDuplicates.length} user(s)...`);
    const results = [];

    for (const user of usersWithDuplicates) {
      try {
        const result = await fixUserDuplicates(user, isDryRun);
        results.push(result);
      } catch (error) {
        log.error(`Failed to fix user ${user.id}: ${error.message}`);
        stats.errors++;
      }
    }

    // Generate final report
    generateReport(results);

    if (isDryRun) {
      log.warning("🔍 DRY RUN COMPLETED - No actual changes were made");
      log.info("💡 To apply changes, run the script without --dry-run flag");
    } else {
      log.success("🎉 All duplicate subscriptions have been fixed!");
    }
  } catch (error) {
    log.error(`💥 Script failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await sequelize.close();
      log.info("🔌 Database connection closed");
    } catch (error) {
      log.error(`Error closing database: ${error.message}`);
    }
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

process.on("SIGTERM", async () => {
  log.warning("\n⚠️  Script terminated");
  try {
    await sequelize.close();
    log.info("🔌 Database connection closed");
  } catch (error) {
    log.error(`Error closing database: ${error.message}`);
  }
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main().catch((error) => {
    log.error(`💥 Unhandled error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = {
  findUsersWithDuplicates,
  fixUserDuplicates,
  generateReport,
};
