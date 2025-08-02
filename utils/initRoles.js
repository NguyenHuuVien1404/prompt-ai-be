const { Role } = require("../models");

const initializeRoles = async () => {
  try {
    console.log("🔄 Đang khởi tạo roles mặc định...");

    // Danh sách roles mặc định
    const defaultRoles = [
      {
        id: 1,
        name: "User",
        description: "Người dùng thường - có thể sử dụng các tính năng cơ bản",
        permissions: {
          view_prompts: true,
          use_prompts: true,
          view_profile: true,
          edit_profile: true,
        },
        is_active: true,
      },
      {
        id: 2,
        name: "Admin",
        description: "Quản trị viên - có toàn quyền quản lý hệ thống",
        permissions: {
          view_prompts: true,
          use_prompts: true,
          view_profile: true,
          edit_profile: true,
          manage_users: true,
          manage_roles: true,
          manage_prompts: true,
          manage_categories: true,
          manage_subscriptions: true,
          view_analytics: true,
          export_data: true,
        },
        is_active: true,
      },
      {
        id: 3,
        name: "Marketer",
        description:
          "Nhân viên marketing - có thể quản lý content và xem analytics",
        permissions: {
          view_prompts: true,
          use_prompts: true,
          view_profile: true,
          edit_profile: true,
          manage_prompts: true,
          manage_categories: true,
          view_analytics: true,
          view_users: true,
        },
        is_active: true,
      },
    ];

    // Tạo hoặc cập nhật từng role
    for (const roleData of defaultRoles) {
      const existingRole = await Role.findByPk(roleData.id);

      if (existingRole) {
        await existingRole.update(roleData);
        console.log(`✅ Cập nhật role: ${roleData.name}`);
      } else {
        await Role.create(roleData);
        console.log(`✅ Tạo role mới: ${roleData.name}`);
      }
    }

    console.log("🎉 Khởi tạo roles thành công!");

    // Hiển thị danh sách roles
    const allRoles = await Role.findAll({
      where: { is_active: true },
      order: [["id", "ASC"]],
    });

    console.log("\n📋 Danh sách roles hiện tại:");
    allRoles.forEach((role) => {
      console.log(
        `  - ID: ${role.id} | Name: ${role.name} | Description: ${role.description}`
      );
    });
  } catch (error) {
    console.error("❌ Lỗi khi khởi tạo roles:", error);
  }
};

// Chạy script nếu được gọi trực tiếp
if (require.main === module) {
  initializeRoles()
    .then(() => {
      console.log("✅ Script khởi tạo roles hoàn thành");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Script khởi tạo roles thất bại:", error);
      process.exit(1);
    });
}

module.exports = { initializeRoles };
