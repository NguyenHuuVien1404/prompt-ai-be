const sequelize = require("../config/database");

async function runMigration() {
  try {
    console.log("Starting migration: Adding type field to categories table...");

    // Thêm cột type vào bảng categories
    await sequelize.query(`
            ALTER TABLE categories 
            ADD COLUMN type ENUM('free', 'premium') NOT NULL DEFAULT 'free' 
            AFTER section_id
        `);

    console.log("Migration completed successfully!");
    console.log(
      'Field "type" has been added to categories table with default value "free"'
    );

    // Cập nhật tất cả categories hiện tại thành 'free' (nếu cần)
    await sequelize.query(`
            UPDATE categories 
            SET type = 'free' 
            WHERE type IS NULL
        `);

    console.log('All existing categories have been set to type "free"');
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Chạy migration nếu file được gọi trực tiếp
if (require.main === module) {
  runMigration()
    .then(() => {
      console.log("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = runMigration;
