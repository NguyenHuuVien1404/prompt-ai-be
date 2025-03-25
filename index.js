const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const ddosProtection = require('./middleware/ddosProtection');
const dotenv = require('dotenv');
const cors = require("cors");
const multer = require('multer');
const mammoth = require('mammoth');

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
    origin: ["https://www.prom.vn", "https://prom.vn"],
    // origin: "*",
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
const PORT = process.env.PORT || 5000;
// Cấu hình rate limiter



app.listen(PORT, () => console.log(`Server running on port ${PORT}`));



