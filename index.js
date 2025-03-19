const express = require('express');
const dotenv = require('dotenv');
const cors = require("cors");

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

dotenv.config();
const app = express();
app.use("/uploads", express.static("uploads"));

app.use(cors({
    origin: ["https://www.prom.vn", "https://prom.vn"],
    // origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
