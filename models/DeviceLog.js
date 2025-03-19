const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const DeviceLog = sequelize.define('DeviceLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  ip_address: { type: DataTypes.STRING(45), allowNull: false },
  os: { type: DataTypes.STRING, allowNull: false },
  browser: { type: DataTypes.STRING, allowNull: false },
  device: { type: DataTypes.STRING, allowNull: false },
  login_time: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  latitude: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'device_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});



module.exports = DeviceLog;
