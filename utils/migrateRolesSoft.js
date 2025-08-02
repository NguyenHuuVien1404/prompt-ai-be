const { User, Role } = require("../models");
const sequelize = require("../config/database");

const migrateRolesSoft = async () => {
  try {
    console.log("🔄 Đang migrate roles một cách nhẹ nhàng...");

    // 1. Tạo bảng roles nếu chưa có
    await Role.sync();
    console.log("✅ Bảng roles đã sẵn sàng");

    // 2. Thêm cột role_id nếu chưa có (không xóa cột role cũ)
    try {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN role_id INT NULL
      `);
      console.log("✅ Đã thêm cột role_id");
    } catch (error) {
      if (error.message.includes("Duplicate column name")) {
        console.log("ℹ️ Cột role_id đã tồn tại");
      } else {
        throw error;
      }
    }

    // 3. Thêm foreign key constraint nếu chưa có
    try {
      await sequelize.query(`
        ALTER TABLE users 
        ADD CONSTRAINT fk_user_role 
        FOREIGN KEY (role_id) REFERENCES roles(id) 
        ON DELETE SET NULL
      `);
      console.log("✅ Đã thêm foreign key constraint");
    } catch (error) {
      if (error.message.includes("Duplicate key name")) {
        console.log("ℹ️ Foreign key constraint đã tồn tại");
      } else {
        console.log("⚠️ Không thể thêm foreign key constraint:", error.message);
      }
    }

    // 4. Cập nhật role_id cho users hiện có
    const updateResult = await sequelize.query(`
      UPDATE users 
      SET role_id = role 
      WHERE role_id IS NULL
    `);
    console.log(
      `✅ Đã cập nhật role_id cho ${updateResult[0].affectedRows} users`
    );

    // 5. Hiển thị thống kê
    const userStats = await sequelize.query(`
      SELECT 
        role,
        role_id,
        COUNT(*) as count
      FROM users 
      GROUP BY role, role_id
    `);

    console.log("\n📊 Thống kê users theo role:");
    userStats[0].forEach((stat) => {
      console.log(
        `  - Role: ${stat.role}, Role ID: ${stat.role_id}, Count: ${stat.count}`
      );
    });

    console.log("\n🎉 Migration nhẹ nhàng hoàn thành!");
    console.log("✅ Tất cả dữ liệu cũ vẫn được bảo toàn");
    console.log("✅ Có thể sử dụng cả role cũ và role_id mới");
  } catch (error) {
    console.error("❌ Lỗi migration:", error);
    throw error;
  }
};

// Chạy script nếu được gọi trực tiếp
if (require.main === module) {
  migrateRolesSoft()
    .then(() => {
      console.log("✅ Script migration hoàn thành");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Script migration thất bại:", error);
      process.exit(1);
    });
}

module.exports = { migrateRolesSoft };
