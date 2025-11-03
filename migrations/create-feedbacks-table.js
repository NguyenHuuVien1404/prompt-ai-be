const sequelize = require("../config/database");

async function createFeedbacksTable() {
  try {
    console.log("🚀 Starting migration: Creating feedbacks table...");

    // Kiểm tra xem bảng đã tồn tại chưa
    const [results] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'feedbacks'
    `);

    if (results[0].count > 0) {
      console.log("⚠️  Table 'feedbacks' already exists. Skipping creation.");
      return;
    }

    // Tạo bảng feedbacks
    await sequelize.query(`
      CREATE TABLE feedbacks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(100) NOT NULL,
        full_name VARCHAR(100) NULL,
        phone VARCHAR(15) NOT NULL,
        feedback_name VARCHAR(100) NOT NULL COMMENT 'Tên người gửi feedback',
        message TEXT NULL,
        status INT NOT NULL DEFAULT 1 COMMENT '1 - Chưa xử lý, 2 - Đã xử lý',
        reply TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        INDEX idx_feedback_user_id (user_id),
        INDEX idx_feedback_status (status),
        INDEX idx_feedback_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("✅ Table 'feedbacks' created successfully!");

    // Thêm comment cho bảng
    await sequelize.query(`
      ALTER TABLE feedbacks 
      COMMENT = 'Bảng lưu trữ feedback từ người dùng'
    `);

    console.log("✅ Migration completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Chạy migration nếu file được gọi trực tiếp
if (require.main === module) {
  createFeedbacksTable()
    .then(() => {
      console.log("✨ Migration script finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = createFeedbacksTable;

