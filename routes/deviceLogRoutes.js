const express = require("express");
const router = express.Router();
const DeviceLog = require("../models/DeviceLog");
const { Sequelize } = require("sequelize");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
router.get("/:userId", async (req, res) => {
  try {
    const user_id = req.params.userId;

    // Lấy tất cả bản ghi DeviceLog của người dùng
    const devices = await DeviceLog.findAll({
      where: { user_id: user_id },
      order: [["created_at", "DESC"]],
    });

    if (devices.length === 0) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy thông tin thiết bị đăng nhập" });
    }

    // Lọc để chỉ lấy bản ghi mới nhất của mỗi địa chỉ IP
    const uniqueDevices = [];
    const ipSet = new Set();

    // Duyệt qua các bản ghi đã sắp xếp để lấy bản ghi mới nhất cho mỗi IP
    for (const device of devices) {
      if (!ipSet.has(device.ip_address)) {
        ipSet.add(device.ip_address);
        uniqueDevices.push(device);
      }
    }

    res.json(uniqueDevices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
