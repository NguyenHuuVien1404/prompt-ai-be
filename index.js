const express = require('express');
const dotenv = require('dotenv');
const cors = require("cors");

const userRoutes = require('./routes/userRoutes');
const promptRoutes = require('./routes/promptRoutes');
const categoryRoutes = require("./routes/categoryRoutes");
const contactRoutes = require("./routes/contactRoutes");
const sectionRoutes = require("./routes/sectionRoutes");

dotenv.config();
const app = express();
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
app.use("/api/sections", sectionRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
