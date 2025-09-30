const { runTask } = require("../utils/worker");

async function runPromptIndustriesMigration() {
  try {
    console.log("Starting prompt industries migration...");

    // Import the migration
    const migration = require("./create-prompt-industries");

    // Get sequelize instance
    const sequelize = require("../config/database");

    // Run the migration
    await migration.up(sequelize.getQueryInterface(), sequelize.constructor);

    console.log("Prompt industries migration completed successfully!");

    // Close the connection
    await sequelize.close();
  } catch (error) {
    console.error("Error running prompt industries migration:", error);
    process.exit(1);
  }
}

// Run the migration if this file is executed directly
if (require.main === module) {
  runPromptIndustriesMigration();
}

module.exports = runPromptIndustriesMigration;
