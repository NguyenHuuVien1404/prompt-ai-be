const express = require("express");
const router = express.Router();
const Section = require("../models/Section")
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
// Lấy danh sách section
router.get("/", async (req, res) => {
    try {
        const sections = await Section.findAll();
        res.json(sections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
