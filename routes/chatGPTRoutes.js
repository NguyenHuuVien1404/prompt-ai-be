const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../models/User");
const History = require("../models/History");
const { authMiddleware } = require('../middleware/authMiddleware');
const sequelize = require("../config/database");
const OPENROUTER_API_KEY = process.env.OPENT_ROUTER_API_KEY;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function prepareMessages(userPrompt, language, nangCap) {
    const systemUpgrand = {
        vi: `Bạn là GPT \"Trình Tối Ưu Hóa Kỹ Thuật Đặt Lệnh\"...`,
        en: `You are a \"Prompt Engineering Optimizer\"...`
    };
    const systemPrompts = {
        vi: "Bạn là một trợ lý AI chuyên nghiệp...",
        en: "You are an AI assistant specialized..."
    };
    const systemFomart = {
        vi: "YÊU CẦU VỀ ĐỊNH DẠNG:...",
        en: "FORMATTING REQUIREMENTS:..."
    };
    const languageGuides = {
        vi: "Hãy trả lời toàn bộ bằng tiếng Việt.",
        en: "Please respond entirely in English."
    };

    const messages = [];
    if (nangCap) messages.push({ role: "system", content: systemUpgrand[language] || systemUpgrand.en });
    else messages.push({ role: "system", content: systemPrompts[language] || systemPrompts.en });

    messages.push(
        { role: "system", content: systemFomart[language] || systemFomart.en },
        { role: "system", content: languageGuides[language] || languageGuides.en },
        { role: "user", content: userPrompt }
    );
    return messages;
}

async function callGPTWithStream(messages, model) {
    let attempts = 0;
    const maxAttempts = 5;
    while (attempts < maxAttempts) {
        try {
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model,
                messages,
                stream: true
            }, {
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                },
                responseType: 'stream'
            });
            return response;
        } catch (error) {
            if (error.response?.status === 429) {
                await delay(2000 * (attempts + 1));
                attempts++;
            } else throw error;
        }
    }
    throw new Error("Không thể gọi OpenRouter API sau nhiều lần thử!");
}

router.post("/gpt-stream", authMiddleware, async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { userPrompt, model, language, title, nangCap } = req.body;
        if (!userPrompt) return res.status(400).json({ error: "Thiếu userPrompt!" });

        const cost = (model === "gpt-4.1" || model === "gpt-4o") ? 5 : 1;
        const userId = req.user.id;
        const user = await User.findByPk(userId, { transaction });
        if (!user || user.count_promt < cost) {
            await transaction.rollback();
            return res.status(403).json({ error: "Hết lượt sử dụng GPT." });
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        req.on('close', async () => await transaction.rollback());

        const messages = prepareMessages(userPrompt, language, nangCap);
        const stream = await callGPTWithStream(messages, model);

        let fullResponse = '';
        let isStreamEnded = false;

        stream.data.on('data', async chunk => {
            if (isStreamEnded) return;
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        isStreamEnded = true;
                        res.write(`data: [DONE]\n\n`);
                        await History.create({ user_id: userId, title, request: userPrompt, respone: fullResponse }, { transaction });
                        user.count_promt -= cost;
                        await user.save({ transaction });
                        await transaction.commit();
                        res.end();
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content;
                        if (content) {
                            fullResponse += content;
                            res.write(`data: ${JSON.stringify({ content })}\n\n`);
                        }
                    } catch (err) {
                        console.error("Parse error:", err);
                    }
                }
            }
        });

        stream.data.on('error', async (err) => {
            console.error("Stream error:", err);
            res.write(`data: ${JSON.stringify({ error: 'Stream error occurred' })}\n\n`);
            res.end();
            await transaction.rollback();
        });

    } catch (err) {
        await transaction.rollback();
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
    }
});

module.exports = router;
