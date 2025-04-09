const express = require("express");
const router = express.Router();
const axios = require("axios");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// Hàm gọi OpenAI API với cơ chế retry
async function callGPT(userPrompt) {
    if (!OPENAI_API_KEY) {
        throw new Error("🚨 API Key chưa được thiết lập!");
    }

    let attempts = 0;
    const maxAttempts = 5; // Thử lại tối đa 5 lần

    while (attempts < maxAttempts) {
        try {
            const response = await axios.post(
                "https://api.openai.com/v1/chat/completions",
                {
                    model: "gpt-4o-mini", // Có thể đổi sang "gpt-3.5-turbo" nếu muốn rẻ hơn
                    messages: [{ role: "user", content: userPrompt }],
                },
                {
                    headers: {
                        "Authorization": `Bearer ${OPENAI_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                }
            );
            return response.data.choices[0].message.content;
        } catch (error) {
            if (error.response) {
                const status = error.response.status;

                if (status === 429) {
                    console.warn(`⚠️ Quá nhiều request! Đang thử lại... (${attempts + 1}/${maxAttempts})`);
                    await delay(2000 * (attempts + 1)); // Tăng thời gian chờ mỗi lần thử
                    attempts++;
                } else {
                    console.error(`❌ OpenAI API lỗi: ${status} -`, error.response.data);
                    throw new Error(`Lỗi OpenAI API: ${error.response.data.error.message || "Không xác định"}`);
                }
            } else {
                console.error("❌ Lỗi kết nối OpenAI API:", error.message);
                throw new Error("Lỗi kết nối API OpenAI");
            }
        }
    }

    throw new Error("🚨 Không thể gọi OpenAI API sau nhiều lần thử!");
}

router.post("/gpt", async (req, res) => {
    try {
        const { userPrompt } = req.body;
        if (!userPrompt) {
            return res.status(400).json({ error: "Thiếu userPrompt trong yêu cầu!" });
        }

        const result = await callGPT(userPrompt);
        res.json({ result });
    } catch (error) {
        console.error("🚨 Lỗi server:", error.message);
        res.status(500).json({ error: error.message || "Lỗi server" });
    }
});
module.exports = router;