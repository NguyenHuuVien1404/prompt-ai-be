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
        vi: `Bạn là một trợ lý AI chuyên nghiệp, có nhiệm vụ phản hồi bằng Markdown được định dạng chính xác để hiển thị giống với định dạng trong Microsoft Word.
        
        YÊU CẦU VỀ ĐỊNH DẠNG:
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
        
        Luôn tuân thủ các quy tắc định dạng trên trong mọi phản hồi.
        `,
    
        en: `You are a professional assistant on prom.vn. Always respond using formatting that resembles Microsoft Word documents.
        
        FORMATTING REQUIREMENTS:
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
        
        Include a practical tip with each response and ask 1-2 follow-up questions to better understand the user's needs. Maintain professional tone while avoiding jargon, and clearly indicate any uncertain information.
        `
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
        let cost = 1;
        if (model === "gpt-4.1" || model === "gpt-4o") {
            cost = 5;
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
        if (user.count_promt < cost) {
            return res.status(403).json({ error: "Hết lượt sử dụng GPT." });
        }

        // Gọi API GPT
        const result = await callGPT(userPrompt, model, language);

        // Chỉ trừ count_prompt khi API call thành công
        // Chỉ trừ count_prompt khi API call thành công

        user.count_promt -= cost;
        await user.save();

        res.json({ result, count: user.count_promt });
    } catch (error) {
        console.error("🚨 Lỗi server:", error.message);
        res.status(500).json({ error: error.message || "Lỗi server" });
    }
});

module.exports = router;