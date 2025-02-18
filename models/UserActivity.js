const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User'); // Đảm bảo đã có model User

const UserActivity = sequelize.define('UserActivity', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    activity_type: {
        type: DataTypes.ENUM('view_article', 'view_prompt', 'comment', 'login', 'logout', 'subscribe', 'upgrade'),
        allowNull: false
    },
    entity_id: {
        type: DataTypes.INTEGER,
        allowNull: true // Có thể null nếu không liên quan đến bài viết/prompt/bình luận cụ thể
    },
    ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true
    },
    user_agent: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'user_activities',
    timestamps: false
});

// Thiết lập quan hệ với User
User.hasMany(UserActivity, { foreignKey: 'user_id', onDelete: 'CASCADE' });
UserActivity.belongsTo(User, { foreignKey: 'user_id' });

module.exports = UserActivity;
