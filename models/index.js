const sequelize = require('../config/database');
const User = require('./User');
const Subscription = require('./Subscription');
const UserSub = require('./UserSub');
const Category = require('./Category');
const Prompt = require('./Prompt');
const Course = require('./Course');
const Payment = require('./Payment');
const UserActivity = require('./UserActivity');

// Định nghĩa các quan hệ
User.hasMany(UserSub, { foreignKey: 'user_id', onDelete: 'CASCADE' });
UserSub.belongsTo(User, { foreignKey: 'user_id' });

Subscription.hasMany(UserSub, { foreignKey: 'sub_id', onDelete: 'CASCADE' });
UserSub.belongsTo(Subscription, { foreignKey: 'sub_id' });

Category.hasMany(Prompt, { foreignKey: 'category_id', onDelete: 'SET NULL' });
Prompt.belongsTo(Category, { foreignKey: 'category_id' });

User.hasMany(Payment, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Payment.belongsTo(User, { foreignKey: 'user_id' });

Subscription.hasMany(Payment, { foreignKey: 'subscription_id', onDelete: 'CASCADE' });
Payment.belongsTo(Subscription, { foreignKey: 'subscription_id' });

User.hasMany(UserActivity, { foreignKey: 'user_id', onDelete: 'CASCADE' });
UserActivity.belongsTo(User, { foreignKey: 'user_id' });

// Đồng bộ Models với Database
sequelize.sync({ force: false }).then(() => {
    console.log("All models were synchronized successfully.");
});

module.exports = { User, Subscription, UserSub, Category, Prompt, Course, Payment, UserActivity };
