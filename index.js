const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const ddosProtection = require('./middleware/ddosProtection');
const dotenv = require('dotenv');
const cors = require("cors");
const multer = require('multer');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const sequelize = require('./config/database.js');

const userRoutes = require('./routes/userRoutes');
const promptRoutes = require('./routes/promptRoutes');
const categoryRoutes = require("./routes/categoryRoutes");
const contactRoutes = require("./routes/contactRoutes");
const sectionRoutes = require("./routes/sectionRoutes");
const blogCategoryRoutes = require("./routes/blogCategoryRoutes");
const blogRoutes = require("./routes/blogRoutes");
const subscriptionRotues = require("./routes/subscriptionRotues");
const topicRoutes = require("./routes/topicRoutes");
const promptFavorite = require("./routes/promptFavoriteRoutes.js");
const productRoutes = require("./routes/productRoutes.js");
const deviceLogRoutes = require("./routes/deviceLogRoutes.js");
const paymentRouters = require("./routes/paymentRouters.js");
const referralRoutes = require("./routes/referralRoutes.js");
const Prompt = require('./models/Prompt.js');
const Topic = require('./models/Topic.js');
const Category = require('./models/Category.js');
const Referral = require('./models/Referral.js');
const chatGPTRoutes = require("./routes/chatGPTRoutes.js");
require('./cronJob.js');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // giới hạn mỗi IP chỉ được gửi 100 request trong 15 phút
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Quá nhiều request từ IP này, vui lòng thử lại sau 15 phút'
});
dotenv.config();
const app = express();
app.use("/uploads", express.static("uploads"));
// Áp dụng rate limiter cho tất cả các request
// app.use(limiter);

// Sử dụng helmet để bảo vệ HTTP headers
app.use(helmet());

// Sử dụng middleware chống DDoS
app.use(ddosProtection);
app.use(cors({
    // origin: ["https://www.prom.vn", "https://prom.vn"],
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
const upload = multer({ dest: 'uploads/' });
app.post('/api/upload-word', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        console.log(req.file)
        // Đọc file Word và chuyển đổi sang HTML
        const result = await mammoth.convertToHtml({ path: req.file.path });
        console.log(result)
        const htmlContent = result.value; // Nội dung HTML

        // Trả về HTML cho frontend
        res.status(200).json({ html: htmlContent });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error processing the file' });
    }
});
app.post('/api/upload-excel', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Read the Excel file
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert the worksheet to JSON for easier processing
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Extract headers (first row)
        const headers = jsonData[0]; // e.g., ['category', 'topic', 'subject', 'title', ...]

        // Process rows (skip the header row)
        const rows = jsonData.slice(1);

        // Function to format content with <p> tags and handle bullet points
        const formatContent = (text, header) => {
            if (!text) return ''; // Handle empty cells

            // Check if the header is 'category' or 'topic'
            if (header === 'category' || header === 'topic' || header === 'title') {
                return text.trim(); // Return plain text without <p> tags
            }

            if (text.includes('●')) {
                // Split by bullet points and wrap each in <p> tags
                const items = text.split('●').filter(item => item.trim()).map(item => `<p>${item.trim()}</p>`);
                return items.join('');
            }
            // Single-line content gets wrapped in <p>
            return `<p>${text.trim()}</p>`;
        };

        // Prepare data for database insertion
        const prompts = [];
        const transaction = await sequelize.transaction(); // Bật transaction

        try {
            for (const row of rows) {
                const promptData = {};
                headers.forEach((header, index) => {
                    promptData[header] = formatContent(row[index], header);
                });

                // Step 1: Check and insert Category if not exists
                let category = await Category.findOne({
                    where: { name: promptData?.category },
                    transaction
                });
                if (!category) {
                    category = await Category.create(
                        { name: promptData?.category },
                        { transaction }
                    );
                }
                const categoryId = category.id;

                // Step 2: Check and insert Topic if not exists, linked to Category
                let topic = await Topic.findOne({
                    where: { name: promptData?.topic },
                    transaction
                });
                if (!topic) {
                    topic = await Topic.create(
                        { name: promptData?.topic },
                        { transaction }
                    );
                }
                const topicId = topic.id;

                // Add categoryId and topicId to promptData
                promptData.category_id = categoryId;
                promptData.topic_id = topicId;
                promptData.is_type = 1;
                prompts.push(promptData);
            }

            // Step 3: Bulk insert prompts into the database
            console.log("hii prompts", prompts)
            if (prompts.length > 0) {
                await Prompt.bulkCreate(
                    prompts.map(p => ({
                        short_description: p.short_description || null,
                        category_id: p.category_id,
                        topic_id: p.topic_id,
                        title: p.title || null,
                        is_type: p.is_type || null,
                        content: p.short_description || null,
                        what: p.what || null,
                        created_at: new Date(),
                        updated_at: new Date(),
                        tips: p.tips || null,
                        text: p.text || null,
                        OptimationGuide: p.OptimationGuide || null,
                        how: p.how || null,
                    })),
                    { transaction }
                );
            }

            // Commit transaction
            await transaction.commit();
        } catch (error) {
            // Rollback nếu có lỗi
            await transaction.rollback();
            throw error;
        }

        // Respond with success
        res.status(200).json({
            message: 'Data successfully saved to database',
            count: prompts.length,
            success: true,
            data: prompts
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error processing the Excel file or saving to database' });
    }
});
app.use('/api/users', userRoutes);
app.use('/api/prompts', promptRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/sections", sectionRoutes);
app.use("/api/blogcategory", blogCategoryRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/subscriptions", subscriptionRotues);
app.use("/api/topic", topicRoutes);
app.use("/api/promptfavorite", promptFavorite);
app.use("/api/products", productRoutes);
app.use("/api/devicelogs", deviceLogRoutes);
app.use("/api/payment", paymentRouters);
app.use("/api/referral", referralRoutes);
app.use("/api/chat", chatGPTRoutes);
const PORT = process.env.PORT || 5000;
// Cấu hình rate limiter



app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



