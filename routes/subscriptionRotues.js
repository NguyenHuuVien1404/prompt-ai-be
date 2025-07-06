const express = require("express");
const router = express.Router();
const Subscription = require("../models/Subscription");
const ContentSubscription = require("../models/ContentSubscription");
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');
// 📌 Lấy danh sách Subscription
router.get("/", async (req, res) => {
    try {
        const subscriptions = await Subscription.findAll();
        res.json(subscriptions);
    } catch (error) {
        res.status(500).json({ error: "Lỗi khi lấy danh sách Subscription!" });
    }
});
router.get("/list", async (req, res) => {
    try {
        let { page = 1, limit = 10, duration } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);

        if (isNaN(page) || isNaN(limit) || page < 1 || limit < 1) {
            return res.status(400).json({ error: "Invalid page or limit value" });
        }

        const offset = (page - 1) * limit;

        // Tạo điều kiện lọc nếu có duration
        const whereClause = {};
        if (duration) {
            whereClause.duration = duration;
        }

        const { count, rows } = await Subscription.findAndCountAll({
            where: whereClause, // Thêm điều kiện lọc
            limit,
            offset,
            order: [["created_at", "DESC"]], // Sắp xếp theo thời gian tạo mới nhất
        });

        res.json({
            totalItems: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            data: rows,
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.get("/by-duration", async (req, res) => {
    try {
        // const { duration } = req.query;

        // // Kiểm tra nếu duration không được cung cấp
        // if (!duration) {
        //     return res.status(400).json({ error: "Duration is required" });
        // }

        // Lấy danh sách subscription theo duration
        const subscriptions = await Subscription.findAll({
            include: [
                { model: ContentSubscription, attributes: ["id", "content", "included", "created_at", "updated_at"] },
            ],
            order: [["updated_at", "DESC"]],
        });

        res.json(subscriptions);
    } catch (error) {
        res.status(500).json({ error: "Lỗi khi lấy danh sách Subscription theo duration!" });
    }
});
//lấy theo duration và type để cập nhật
router.get("/by-duration-and-type", async (req, res) => {
    try {
        const { duration, type } = req.query;

        // Kiểm tra nếu duration không được cung cấp
        if (!duration) {
            return res.status(400).json({ error: "Duration is required" });
        }
        // Lấy danh sách subscription theo duration
        const subscriptions = await Subscription.findOne({
            where: { duration: duration, type: type },
            include: [
                { model: ContentSubscription, attributes: ["id", "content", "included", "created_at", "updated_at"] },
            ],
            order: [["updated_at", "DESC"]],
        });

        res.json(subscriptions);
    } catch (error) {
        res.status(500).json({ error: "Lỗi khi lấy danh sách Subscription theo duration!" });
    }
});
// 📌 Lấy Subscription theo ID
router.get("/:id", async (req, res) => {
    try {
        const subscription = await Subscription.findByPk(req.params.id);
        if (!subscription) {
            return res.status(404).json({ error: "Không tìm thấy Subscription!" });
        }
        res.json(subscription);
    } catch (error) {
        res.status(500).json({ error: "Lỗi khi lấy Subscription!" });
    }
});

// 📌 Tạo Subscription mới
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { 
            name_sub, 
            type, 
            duration, 
            billing_cycle,
            price, 
            price_year, 
            price_per_month_year,
            price_total_yearly,
            description, 
            description_per_year,
            imageDiscount,
            is_popular
        } = req.body;
        
        const newSubscription = await Subscription.create({ 
            name_sub, 
            type, 
            duration, 
            billing_cycle,
            price, 
            price_year, 
            price_per_month_year,
            price_total_yearly,
            description, 
            description_per_year,
            imageDiscount,
            is_popular
        });
        
        res.status(201).json(newSubscription);
    } catch (error) {
        res.status(500).json(error);
    }
});

// 📌 Cập nhật Subscription
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { 
            name_sub, 
            type, 
            duration, 
            billing_cycle,
            price, 
            price_year, 
            price_per_month_year,
            price_total_yearly,
            description, 
            description_per_year,
            imageDiscount,
            is_popular
        } = req.body;
        
        const subscription = await Subscription.findByPk(req.params.id);
        if (!subscription) {
            return res.status(404).json({ error: "Không tìm thấy Subscription!" });
        }
        
        await subscription.update({ 
            name_sub, 
            type, 
            duration, 
            billing_cycle,
            price, 
            price_year, 
            price_per_month_year,
            price_total_yearly,
            description, 
            description_per_year,
            imageDiscount,
            is_popular
        });
        
        res.json(subscription);
    } catch (error) {
        res.status(500).json({ error: "Lỗi khi cập nhật Subscription!" });
    }
});

// 📌 Xóa Subscription
router.delete("/:id", async (req, res) => {
    try {
        const subscription = await Subscription.findByPk(req.params.id);
        if (!subscription) {
            return res.status(404).json({ error: "Không tìm thấy Subscription!" });
        }
        await subscription.destroy();
        res.json({ message: "Xóa Subscription thành công!" });
    } catch (error) {
        res.status(500).json({ error: "Lỗi khi xóa Subscription!" });
    }
});
module.exports = router;
