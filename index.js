const express = require("express");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const ddosProtection = require("./middleware/ddosProtection");
const dotenv = require("dotenv");
const cors = require("cors");
const multer = require("multer");
const mammoth = require("mammoth");
const XLSX = require("xlsx");
const sequelize = require("./config/database.js");
const { runTask } = require("./utils/worker");
const compression = require("compression");
const {
  apiLimiter,
  authLimiter,
  uploadLimiter,
  paymentLimiter,
} = require("./middleware/rateLimiter");

const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const statsRoutes = require("./routes/statsRoutes");
const promptRoutes = require("./routes/promptRoutes");
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
const Prompt = require("./models/Prompt.js");
const Topic = require("./models/Topic.js");
const Category = require("./models/Category.js");
const Referral = require("./models/Referral.js");
const chatGPTRoutes = require("./routes/chatGPTRoutes.js");
const historyRoutes = require("./routes/historyRoutes.js");
const couponRoutes = require("./routes/couponRoutes");
const industryRoutes = require("./routes/industryRoutes");
require("./cronJob.js");

dotenv.config();
const app = express();
const shouldCompress = (req, res) => {
  if (req._noCompression) return false; // bỏ nén cho những route gắn cờ này
  return compression.filter(req, res);
};

app.use(compression({ filter: shouldCompress }));
// Nén dữ liệu trước khi gửi để giảm bandwith và tăng tốc độ

// Static file serving is handled by nginx at /uploads/ path

// Sử dụng helmet để bảo vệ HTTP headers nhưng tắt một số features gây xung đột CORS
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// Sử dụng middleware chống DDoS - TẠM THỜI TẮT
// app.use(ddosProtection);

app.use(
  cors({
    // origin: ["https://www.prom.vn", "https://prom.vn"],
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Origin",
      "X-Requested-With",
      "Accept",
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 200,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Áp dụng rate limiter cho các loại API khác nhau
app.use("/api/users", authLimiter);
app.use("/api/payment", paymentLimiter);
app.use("/api/upload", uploadLimiter);

// Áp dụng API limiter cho các routes còn lại
app.use("/api", apiLimiter);

const upload = multer({ dest: "/var/www/promvn/uploads/" });

app.post("/api/upload-word", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    // Đọc file Word và chuyển đổi sang HTML
    const result = await mammoth.convertToHtml({ path: req.file.path });
    const htmlContent = result.value; // Nội dung HTML

    // Trả về HTML cho frontend
    res.status(200).json({ html: htmlContent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error processing the file" });
  }
});

// Route này đã được chuyển sang promptRoutes.js với endpoint /import-excel
// Sử dụng worker để xử lý Excel file với logging chi tiết

// Đổi các routes để sử dụng rate limiter
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/prompts", promptRoutes);
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
app.use("/api/history", historyRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/industries", industryRoutes);
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
