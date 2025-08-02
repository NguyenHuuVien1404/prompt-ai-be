const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Referral = require("./Referral");
const Role = require("./Role");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    password_hash: { type: DataTypes.STRING, allowNull: true },
    full_name: { type: DataTypes.STRING },
    device_log: { type: DataTypes.STRING, allowNull: true },
    account_status: { type: DataTypes.INTEGER, defaultValue: 1 },

    // ✅ Giữ nguyên cột role cũ
    role: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },

    // ✅ Thêm cột role_id mới (optional)
    role_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Role,
        key: "id",
      },
      onDelete: "SET NULL",
    },

    count_promt: { type: DataTypes.INTEGER, defaultValue: 5 },
    google_id: { type: DataTypes.STRING, allowNull: true },
    profile_image: { type: DataTypes.STRING },
    otp_code: { type: DataTypes.STRING },
    otp_expires_at: { type: DataTypes.DATE },
    is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    referral_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: Referral,
        key: "id",
      },
      onDelete: "CASCADE",
    },
  },
  {
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// ✅ Thêm virtual methods để mapping role
User.prototype.getRoleName = function () {
  const roleMap = {
    1: "User",
    2: "Admin",
    3: "Marketer",
  };
  return roleMap[this.role] || "Unknown";
};

User.prototype.getRoleId = function () {
  // Nếu có role_id thì dùng, không thì map từ role cũ
  if (this.role_id) {
    return this.role_id;
  }
  // Mapping từ role cũ sang role_id
  const roleMapping = {
    1: 1, // User
    2: 2, // Admin
    3: 3, // Marketer
  };
  return roleMapping[this.role] || 1;
};

module.exports = User;
