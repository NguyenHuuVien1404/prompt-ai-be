const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../models/User"); // Không destructure
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const { authMiddleware, adminMiddleware } = require('../middleware/authMiddleware');

// Hàm gọi OpenAI API với model và prompt tùy chọn
async function callGPT(userPrompt, model = "gpt-4o-mini", language = "en") {
    if (!OPENAI_API_KEY) {
        throw new Error("🚨 API Key chưa được thiết lập!");
    }

    const systemPrompts = {
        vi: `Bạn là một trợ lý chuyên nghiệp trên prom.vn. Luôn trả lời rõ ràng, dễ hiểu, chuyên nghiệp. Kèm theo mỗi câu trả lời, hãy cung cấp mẹo hoặc gợi ý có thể áp dụng ngay. Luôn đặt 1–2 câu hỏi follow-up liên quan trực tiếp để khai thác nhu cầu thực sự của người dùng. Nếu có thông tin chưa chắc chắn, hãy cảnh báo rõ ràng. Tránh vòng vo, không đưa thông tin dư thừa. Giữ giọng điệu lịch thiệp, tôn trọng, không dùng biệt ngữ gây khó hiểu.`,
        en: `You are a professional assistant on prom.vn. Always respond clearly, understandably, and professionally. Include a practical tip or suggestion with each response. Always ask 1–2 follow-up questions directly related to uncover the user's true needs. If information is uncertain, clearly warn about it. Avoid being vague or redundant. Maintain a polite and respectful tone, and avoid jargon that may confuse the user.`
    };

    const languageGuides = {
        vi: "Hãy trả lời toàn bộ bằng tiếng Việt.",
        en: "Please respond entirely in English."
    };

    let attempts = 0;
    const maxAttempts = 5;

    const messages = [
        {
            role: "system",
            content: systemPrompts[language] || systemPrompts.en
        },
        {
            role: "system",
            content: languageGuides[language] || languageGuides.en
        },
        {
            role: "user",
            content: userPrompt
        }
    ];

    while (attempts < maxAttempts) {
        try {
            const response = await axios.post(
                "https://api.openai.com/v1/chat/completions",
                {
                    model,
                    messages
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
                    await delay(2000 * (attempts + 1));
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

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

router.post("/gpt", authMiddleware, async (req, res) => {
    try {
        const { userPrompt, model, language, id } = req.body;

        if (!userPrompt) {
            return res.status(400).json({ error: "Thiếu userPrompt trong yêu cầu!" });
        }

        const userId = req.user.id;
        const user = await User.findByPk(userId);
        console.log(user)
        if (!user) {
            return res.status(404).json({ error: "Không tìm thấy người dùng." });
        }

        if (user.count_promt <= 0) {
            return res.status(403).json({ error: "Hết lượt sử dụng GPT." });
        }

        // Gọi API GPT
        const result = await callGPT(userPrompt, model, language);

        // Chỉ trừ count_prompt khi API call thành công
        // Chỉ trừ count_prompt khi API call thành công
        let cost = 1;
        if (model === "gpt-4.1" || model === "gpt-4o") {
            cost = 5;
        }
        user.count_promt -= cost;
        await user.save();

        res.json({ result, count: user.count_promt });
    } catch (error) {
        console.error("🚨 Lỗi server:", error.message);
        res.status(500).json({ error: error.message || "Lỗi server" });
    }
});

module.exports = router;