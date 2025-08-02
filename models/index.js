const sequelize = require("../config/database");
const User = require("./User");
const Role = require("./Role");
const Subscription = require("./Subscription");
const UserSub = require("./UserSub");
const Category = require("./Category");
const Prompt = require("./Prompt");
const Course = require("./Course");
const Payment = require("./Payment");
const UserActivity = require("./UserActivity");
const PromFavorite = require("./PromFavorite");
const Referral = require("./Referral");
const Product = require("./Product");
const Section = require("./Section");
const PromDetails = require("./PromDetails");
const DeviceLog = require("./DeviceLog");
const History = require("./History");
// Định nghĩa các quan hệ với tên khóa ngoại cụ thể
User.hasMany(UserSub, {
  foreignKey: "user_id",
  onDelete: "CASCADE",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_usersub_user_id", // Đặt tên cho khóa ngoại
});
UserSub.belongsTo(User, {
  foreignKey: "user_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_usersub_user_id",
});

Subscription.hasMany(UserSub, {
  foreignKey: "sub_id",
  onDelete: "CASCADE",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_usersub_sub_id",
});
UserSub.belongsTo(Subscription, {
  foreignKey: "sub_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_usersub_sub_id",
});

Category.hasMany(Prompt, {
  foreignKey: "category_id",
  onDelete: "SET NULL",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_prompt_category_id",
});
Prompt.belongsTo(Category, {
  foreignKey: "category_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_prompt_category_id",
});

User.hasMany(Payment, {
  foreignKey: "user_id",
  onDelete: "CASCADE",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_payment_user_id",
});
Payment.belongsTo(User, {
  foreignKey: "user_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_payment_user_id",
});

Subscription.hasMany(Payment, {
  foreignKey: "subscription_id",
  onDelete: "CASCADE",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_payment_subscription_id",
});
Payment.belongsTo(Subscription, {
  foreignKey: "subscription_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_payment_subscription_id",
});

User.hasMany(UserActivity, {
  foreignKey: "user_id",
  onDelete: "CASCADE",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_useractivity_user_id",
});
UserActivity.belongsTo(User, {
  foreignKey: "user_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_useractivity_user_id",
});

User.hasMany(PromFavorite, {
  foreignKey: "user_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_promfavorite_user_id",
});
PromFavorite.belongsTo(User, {
  foreignKey: "user_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_promfavorite_user_id",
});

Prompt.hasMany(PromFavorite, {
  foreignKey: "prompt_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_promfavorite_prompt_id",
});
PromFavorite.belongsTo(Prompt, {
  foreignKey: "prompt_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_promfavorite_prompt_id",
});

User.belongsTo(Referral, {
  foreignKey: "referral_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_user_referral_id",
});
Referral.hasMany(User, {
  foreignKey: "referral_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_user_referral_id",
});
// Quan hệ giữa Section và Product (1 Section có nhiều Product)
Section.hasMany(Product, {
  foreignKey: "section_id",
  onDelete: "CASCADE",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_product_section_id",
});
Product.belongsTo(Section, {
  foreignKey: "section_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_product_section_id",
});
Prompt.hasMany(PromDetails, {
  foreignKey: "prompt_id",
  onDelete: "CASCADE",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_promdetails_prompt_id",
});
PromDetails.belongsTo(Prompt, {
  foreignKey: "prompt_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_promdetails_prompt_id",
});
User.hasMany(DeviceLog, {
  foreignKey: "user_id",
  onDelete: "CASCADE",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_device_user_id",
});
DeviceLog.belongsTo(User, {
  foreignKey: "user_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_device_user_id",
});
// Định nghĩa quan hệ giữa User và Role
User.belongsTo(Role, {
  foreignKey: "role_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_user_role_id",
});
Role.hasMany(User, {
  foreignKey: "role_id",
  constraints: true,
  foreignKeyConstraint: true,
  name: "fk_user_role_id",
});

// Đồng bộ Models với Database
sequelize
  .sync({ force: false, alter: false })
  .then(() => {
    console.log("All models were synchronized successfully.");
  })
  .catch((error) => {
    console.error("Error synchronizing models:", error);
  });

module.exports = {
  User,
  Role,
  Subscription,
  UserSub,
  Category,
  Prompt,
  Course,
  Payment,
  UserActivity,
  PromFavorite,
  DeviceLog,
  Referral,
  History,
};
