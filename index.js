const express = require('express');
const dotenv = require('dotenv');
const cors = require("cors");

const userRoutes = require('./routes/userRoutes');
const promptRoutes = require('./routes/promptRoutes');
const categoryRoutes = require("./routes/categoryRoutes");
const contactRoutes = require("./routes/contactRoutes");
const blogCategoryRoutes = require("./routes/blogCategoryRoutes");
const blogRoutes = require("./routes/blogRoutes");
dotenv.config();
const app = express();
app.use("/uploads", express.static("uploads"));

app.use(cors({
    origin: "*", // Chỉ cho phép React frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

app.use('/api/users', userRoutes);
app.use('/api/prompts', promptRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/blogcategory", blogCategoryRoutes);
app.use("/api/blog", blogRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
