const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: process.env.DB_DIALECT,
    logging: false,
    define: {
      timestamps: true
    },
    pool: {
      max: 20, // Tối đa 20 connections
      min: 5, // Tối thiểu 5 connections
      acquire: 30000, // Thời gian tối đa để lấy connection (ms)
      idle: 10000 // Thời gian connection không hoạt động trước khi đóng (ms)
    },
    retry: {
      max: 3 // Số lần thử lại kết nối tối đa nếu kết nối thất bại
    }
  }
);

// Test the connection
sequelize.authenticate()
  .then(() => console.log('Database connected successfully.'))
  .catch(err => console.error('Unable to connect to the database:', err));

module.exports = sequelize;
