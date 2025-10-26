#!/usr/bin/env node

/**
 * Script để fix tất cả duplicate UserSubs trên production
 * Usage: node scripts/fix-all-usersubs.js
 */

require("dotenv").config();
const sequelize = require("../config/database");

async function fixAllDuplicateUserSubs() {
  try {
    console.log("🔌 Connecting to database...");
    await sequelize.authenticate();
    console.log("✅ Database connected");

    console.log("🔍 Finding all users with duplicate active subscriptions...");

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
    console.log("\n📋 SUMMARY:");
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

    console.log(`\n⚠️  This will affect ${results.length} users:`);
    console.log(`   ✅ Keep: ${results.length} subscription(s) (newest)`);
    console.log(
      `   ❌ Deactivate: ${results.reduce(
        (sum, user) => sum + user.active_subscriptions_count - 1,
        0
      )} subscription(s) (older)`
    );

    console.log("\nPress Ctrl+C to cancel, or wait 10 seconds to proceed...");
    await new Promise((resolve) => setTimeout(resolve, 10000));

    let fixedCount = 0;
    let deactivatedCount = 0;
    let errorCount = 0;

    console.log("\n🔧 Starting to fix duplicate subscriptions...");

    // Fix từng user
    for (const user of results) {
      try {
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

        // Start transaction for this user
        const transaction = await sequelize.transaction();

        try {
          // Vô hiệu hóa các subscription cũ
          for (const subInfo of deactivateSubscriptions) {
            const [subId, subName, subType, subToken] = subInfo.split(":");

            // Update status to 0 (inactive)
            await sequelize.query(
              "UPDATE UserSubs SET status = 0 WHERE id = ?",
              {
                replacements: [subId],
                transaction,
              }
            );

            deactivatedCount++;
            console.log(`      - Deactivated ${subName} (ID: ${subId})`);
          }

          await transaction.commit();
          fixedCount++;
          console.log(`   ✅ User ${user.user_id} fixed successfully`);
        } catch (error) {
          await transaction.rollback();
          console.error(
            `   ❌ Error fixing user ${user.user_id}: ${error.message}`
          );
          errorCount++;
        }
      } catch (error) {
        console.error(
          `❌ Error processing user ${user.user_id}: ${error.message}`
        );
        errorCount++;
      }
    }

    console.log(`\n🎉 COMPLETED!`);
    console.log("=".repeat(50));
    console.log(`✅ Users fixed: ${fixedCount}`);
    console.log(`❌ Subscriptions deactivated: ${deactivatedCount}`);
    console.log(`🚨 Errors: ${errorCount}`);

    if (errorCount > 0) {
      console.log(
        `\n⚠️  ${errorCount} users had errors. Check the logs above.`
      );
    }

    // Verify results
    console.log("\n🔍 Verifying results...");
    const [verifyResults] = await sequelize.query(`
      SELECT COUNT(*) as remaining_duplicates
      FROM (
        SELECT u.id
        FROM Users u
        INNER JOIN UserSubs us ON u.id = us.user_id
        WHERE us.status = 1
        GROUP BY u.id
        HAVING COUNT(us.id) > 1
      ) as duplicates
    `);

    const remainingDuplicates = verifyResults[0].remaining_duplicates;

    if (remainingDuplicates === 0) {
      console.log("✅ All duplicate subscriptions have been fixed!");
    } else {
      console.log(
        `⚠️  ${remainingDuplicates} users still have duplicate subscriptions`
      );
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

// Handle process termination
process.on("SIGINT", async () => {
  console.log("\n⚠️  Script interrupted by user");
  try {
    await sequelize.close();
    console.log("🔌 Database connection closed");
  } catch (error) {
    console.error(`Error closing database: ${error.message}`);
  }
  process.exit(0);
});

// Run the script
fixAllDuplicateUserSubs();
