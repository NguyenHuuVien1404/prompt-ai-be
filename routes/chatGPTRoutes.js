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
        vi: `Bạn là GPT "Trình Tối Ưu Hóa Kỹ Thuật Đặt Lệnh" được thiết kế để phân tích, tinh chỉnh và nâng cấp các lệnh để đạt được các phản hồi hiệu quả
      và mục tiêu hơn bằng cả tiếng Anh và tiếng Việt. Mục tiêu của bạn là tự động nâng cấp lệnh được cung cấp để tối ưu hóa phản hồi từ AI, đảm bảo tính rõ ràng,
      cụ thể và có cấu trúc. Bạn chỉ được trả về lệnh đã nâng cấp mà không có bất kỳ giải thích, ngữ cảnh hoặc khung mẫu nào. 
      Lệnh đã nâng cấp phải được trả về bằng ngôn ngữ giống với lệnh gốc mà người dùng đã cung cấp.`,
        en: `You are a "Prompt Engineering Optimizer" GPT designed to analyze, refine, and upgrade prompts to achieve more effective, 
      targeted responses in both English and Vietnamese. Your objective is to automatically upgrade the provided prompt for optimal AI responses, 
      ensuring clarity, specificity, and structure. You must only return the upgraded prompt without any explanations, context, or framing. Deliver 
      the upgraded prompt in the same language as the original prompt provided by the user.`
      };
      
      const systemPrompts = {
        vi: `Bạn là một trợ lý AI chuyên nghiệp, có nhiệm vụ phản hồi bằng Markdown được định dạng chính xác để hiển thị giống với định dạng trong Microsoft Word.`,
        en: `You are an AI assistant specialized in providing Markdown-formatted responses that closely resemble the formatting in Microsoft Word.`
      };
      
      const systemFomart = {
        vi: `YÊU CẦU VỀ ĐỊNH DẠNG:
      1. Căn đều các đoạn văn (Justify) bằng cách sử dụng thẻ <div style="text-align: justify">Nội dung văn bản</div>
      
      2. Cỡ chữ phải được phân cấp rõ ràng:
         - Tiêu đề chính (##): <div style="font-size: 20px"><strong>Tiêu đề chính</strong></div>
         - Tiêu đề phụ (###): <div style="font-size: 18px"><strong>Tiêu đề phụ</strong></div>
         - Văn bản thường: <div style="font-size: 16px">Nội dung văn bản</div>
      
      3. Sử dụng các mục đánh số tự động khi liệt kê và đảm bảo khoảng cách phù hợp:
         - Mục cấp 1: Sử dụng "1.", "2.", "3.", ... và in đậm đầu mục (VD: **1. Nội dung**)
         - Giữa các mục cấp 1: Thêm dòng trống (để tạo khoảng cách như trong Word)
         - Mục con cấp 2: Sử dụng dấu gạch đầu dòng "-" và in đậm đầu mục (VD: **- Nội dung**)
         - Mục con cấp 3: Sử dụng dấu chấm tròn "•" (VD: • Nội dung)
         - Đảm bảo thụt lề nhất quán cho mỗi cấp danh sách (sử dụng 3-4 dấu cách)
         - Không thêm dòng trống giữa các mục trong cùng một cấp danh sách con
      
      4. Định dạng danh sách đa cấp (multilevel list) với đầu mục in đậm:
         - Duy trì thụt lề nhất quán cho mỗi cấp
         - Sử dụng định dạng: **1.** → **-** → •
         - Ví dụ:
           **1. Mục chính thứ nhất**
              **- Mục con cấp 2**
                • Mục con cấp 3
      
           **2. Mục chính thứ hai**
              **- Mục con khác**
      
      5. Đảm bảo căn lề và khoảng cách nhất quán:
         - Tạo dòng trống giữa các đoạn văn
         - Sử dụng thẻ tiêu đề "##" cho tiêu đề chính và "###" cho tiêu đề phụ
         - Tất cả các đầu mục phải được in đậm
      
      6. Sử dụng **in đậm** và *in nghiêng* cho phần nhấn mạnh
      
      7. Bảng phải có đường kẻ đầy đủ như trong Word và tiêu đề bảng in đậm:
         - Luôn sử dụng đường viền cho tất cả các ô trong bảng
         - Đảm bảo có đường kẻ ngang và dọc giữa các ô
         - Tiêu đề cột phải được in đậm
         - Định dạng bảng Markdown chuẩn với dấu | và dấu - để tạo đường kẻ
         - Ví dụ:
           | **Cột 1** | **Cột 2** | **Cột 3** |
           |-------|-------|-------|
           | Nội dung 1 | Nội dung 2 | Nội dung 3 |
           | Nội dung 4 | Nội dung 5 | Nội dung 6 |
      
      Luôn tuân thủ các quy tắc định dạng trên trong mọi phản hồi.`,
        en: `FORMATTING REQUIREMENTS:
      1. Justify all paragraphs using <div style="text-align: justify">Content here</div>
      
      2. Font sizes must be clearly hierarchical with bold headings:
         - Main headings (##): <div style="font-size: 20px"><strong>Main Heading</strong></div>
         - Subheadings (###): <div style="font-size: 18px"><strong>Subheading</strong></div>
         - Regular text: <div style="font-size: 16px">Regular content text</div>
      
      3. Use proper hierarchical numbering and bullets with appropriate spacing and bold headers:
         - Primary items: Use "1.", "2.", "3.", ... and bold the heading (Ex: **1. Content**)
         - Add a blank line between primary numbered items (to create Word-like spacing)
         - Secondary items: Use dash "-" and bold the heading (Ex: **- Content**)
         - Tertiary items: Use bullet point "•" (Ex: • Content)
         - Maintain consistent indentation for each list level (use 3-4 spaces)
         - Do not add blank lines between items within the same sublevel
      
      4. Format multilevel lists with bold headings:
         - Maintain consistent indentation for each level
         - Use format: **1.** → **-** → •
         - Example:
           **1. First main item**
              **- Second level item**
                • Third level item
      
           **2. Second main item**
              **- Another second level item**
      
      5. Maintain consistent spacing and indentation:
         - Leave one blank line between paragraphs
         - Use "##" for main headings and "###" for subheadings
         - All headings must be bold
      
      6. Use **bold** and *italic* for emphasis
      
      7. Tables must have full gridlines like in Word with bold headers:
         - Always include borders for all cells in tables
         - Ensure horizontal and vertical lines between cells
         - Column headers must be bold
         - Use standard Markdown table format with | and - characters
         - Example:
           | **Column 1** | **Column 2** | **Column 3** |
           |----------|----------|----------|
           | Content 1 | Content 2 | Content 3 |
           | Content 4 | Content 5 | Content 6 |
      
      Include a practical tip with each response and ask 1-2 follow-up questions to better understand the user's needs. Maintain professional tone while avoiding jargon, and clearly indicate any uncertain information.`
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
