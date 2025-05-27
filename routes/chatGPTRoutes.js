const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../models/User");
const History = require("../models/History");
const { authMiddleware } = require('../middleware/authMiddleware');
const sequelize = require("../config/database");

// ✅ Fix typo trong env variable name
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY; // Sửa từ OPENT_ROUTER_API_KEY

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ✅ StreamBuffer Class
class StreamBuffer {
    constructor() {
        this.buffer = '';
    }
    
    addChunk(chunk) {
        const chunkStr = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
        this.buffer += chunkStr;
        
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || '';
        
        return lines.filter(line => line.trim());
    }
    
    flush() {
        const remaining = this.buffer.trim();
        this.buffer = '';
        return remaining ? [remaining] : [];
    }
}

// ✅ Parse SSE Data Function
function parseSSEData(line) {
    try {
        let data = line.trim();
        
        if (data.startsWith('data: ')) {
            data = data.substring(6);
        }
        
        if (data === '[DONE]') {
            return { type: 'done' };
        }
        
        if (!data.startsWith('{')) {
            return { type: 'skip' };
        }
        
        const parsed = JSON.parse(data);
        
        if (!parsed.choices || !Array.isArray(parsed.choices)) {
            return { type: 'skip' };
        }
        
        const choice = parsed.choices[0];
        if (!choice || !choice.delta) {
            return { type: 'skip' };
        }
        
        const content = choice.delta.content;
        if (typeof content === 'string') {
            return { type: 'content', content: content };
        }
        
        return { type: 'skip' };
        
    } catch (error) {
        console.warn('⚠️ Parse error for line:', line.substring(0, 100), error.message);
        return { type: 'error', error: error.message };
    }
}

// ✅ Improved OpenRouter API call
async function callGPTWithStream(messages, model) {
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
        try {
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                model,
                messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 4000,
            }, {
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
                    "X-Title": "Prom.vn AI Assistant"
                },
                responseType: 'stream',
                timeout: 60000, // 60s timeout
                decompress: false,
                maxRedirects: 0
            });
            return response;
        } catch (error) {
            attempts++;
            
            if (error.response?.status === 429 && attempts < maxAttempts) {
                const delayTime = Math.min(2000 * attempts, 10000);
                // console.log(`⏳ Rate limited, retrying in ${delayTime}ms...`);
                await delay(delayTime);
                continue;
            } else {
                throw error;
            }
        }
    }
    throw new Error("Không thể gọi OpenRouter API sau nhiều lần thử!");
}

// ✅ Main route handler
router.post("/gpt-stream", (req, res, next) => {
    req._noCompression = true;
    res.set('X-Accel-Buffering', 'no');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
}, authMiddleware, async (req, res) => {
    
    let transaction;
    let isCompleted = false; // ✅ Khai báo biến
    let fullResponse = "";
    let chunkCount = 0; // ✅ Khai báo biến
    let lastHeartbeat = Date.now(); // ✅ Khai báo biến
    let heartbeatInterval; // ✅ Khai báo biến
    
    const streamBuffer = new StreamBuffer();
    
    try {
        const { userPrompt, model, language, title, nangCap } = req.body;
        
        // ✅ Enhanced validation
        if (!userPrompt?.trim()) {
            return res.status(400).json({ error: "userPrompt không được để trống" });
        }
        
        if (userPrompt.length > 10000) {
            return res.status(400).json({ error: "userPrompt quá dài (tối đa 10,000 ký tự)" });
        }
        
        transaction = await sequelize.transaction();
        
        const cost = (model === "gpt-4o" || model === "gpt-4-turbo") ? 5 : 1;
        const userId = req.user.id;
        
        const user = await User.findByPk(userId, { 
            transaction,
            lock: true // ✅ Prevent race condition
        });
        
        if (!user || user.count_promt < cost) {
            await transaction.rollback();
            return res.status(403).json({ 
                error: "Không đủ credit",
                required: cost,
                available: user?.count_promt || 0
            });
        }
        
        // ✅ Setup enhanced headers
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        
        // ✅ Send connection confirmation
        res.write(`data: ${JSON.stringify({ 
            type: 'connected', 
            timestamp: Date.now(),
            model: model,
            cost: cost
        })}\n\n`);
        res.flush();
        
        // ✅ Setup heartbeat interval
        heartbeatInterval = setInterval(() => {
            if (!isCompleted && Date.now() - lastHeartbeat > 30000) {
                res.write(`: heartbeat ${Date.now()}\n\n`);
                res.flush();
            }
        }, 15000);
        
        // ✅ Cleanup function
        const cleanup = async (reason = 'unknown') => {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            
            if (!isCompleted && transaction) {
                // console.log(`🔄 Cleanup triggered: ${reason}`);
                try {
                    await transaction.rollback();
                } catch (err) {
                    console.error("❌ Rollback error:", err);
                }
            }
        };
        
        // ✅ Handle client disconnect
        req.on("close", () => cleanup('client_disconnect'));
        req.on("aborted", () => cleanup('client_abort'));
        
        // ✅ Handle completion function
        async function handleCompletion() {
            if (isCompleted) return;
            isCompleted = true;
            
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
            }
            
            try {
                // Validate response completeness
                if (!fullResponse.trim()) {
                    throw new Error("Empty response received");
                }
                
                // Deduct credits first
                user.count_promt -= cost;
                await user.save({ transaction });
                
                // Save to history
                await History.create({
                    user_id: userId,
                    title: title || userPrompt.substring(0, 50),
                    request: userPrompt,
                    respone: fullResponse,
                    model: model,
                    cost: cost,
                    chunks_received: chunkCount
                }, { transaction });
                
                await transaction.commit();
                
                // Send completion data
                const completionData = {
                    type: 'completed',
                    totalChunks: chunkCount,
                    totalLength: fullResponse.length,
                    checksum: Buffer.from(fullResponse).toString('base64').slice(-10),
                    cost: cost,
                    remainingCredits: user.count_promt,
                    timestamp: Date.now()
                };
                
                res.write(`data: ${JSON.stringify(completionData)}\n\n`);
                res.write(`data: [DONE]\n\n`);
                res.flush();
                res.end();
                
                // console.log(`✅ Stream completed: ${chunkCount} chunks, ${fullResponse.length} chars`);
                
            } catch (err) {
                console.error("❌ Completion error:", err);
                
                if (transaction) {
                    await transaction.rollback();
                }
                
                res.write(`data: ${JSON.stringify({ 
                    type: 'error', 
                    error: "Lỗi lưu dữ liệu: " + err.message,
                    timestamp: Date.now()
                })}\n\n`);
                res.flush();
                res.end();
            }
        }
        
        // ✅ Call OpenRouter API
        const messages = prepareMessages(userPrompt, language, nangCap);
        const stream = await callGPTWithStream(messages, model);
        
        // ✅ Process stream data
        stream.data.on("data", (chunk) => {
            if (isCompleted) return;
            
            lastHeartbeat = Date.now();
            chunkCount++;
            
            try {
                const lines = streamBuffer.addChunk(chunk);
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    
                    const result = parseSSEData(line);
                    
                    switch (result.type) {
                        case 'content':
                            fullResponse += result.content;
                            
                            const payload = {
                                type: 'content',
                                content: result.content,
                                chunkId: chunkCount,
                                totalLength: fullResponse.length,
                                timestamp: Date.now()
                            };
                            
                            res.write(`data: ${JSON.stringify(payload)}\n\n`);
                            res.flush();
                            break;
                            
                        case 'done':
                            handleCompletion();
                            return;
                            
                        case 'error':
                            console.warn("⚠️ Parse error:", result.error);
                            break;
                    }
                }
            } catch (err) {
                console.error("❌ Chunk processing error:", err);
            }
        });
        
        // ✅ Handle stream end
        stream.data.on("end", () => {
            if (!isCompleted) {
                // console.log("📝 Stream ended, processing remaining buffer");
                
                const remainingLines = streamBuffer.flush();
                for (const line of remainingLines) {
                    const result = parseSSEData(line);
                    if (result.type === 'content') {
                        fullResponse += result.content;
                    }
                }
                
                handleCompletion();
            }
        });
        
        // ✅ Handle stream error
        stream.data.on("error", async (err) => {
            console.error("❌ Stream error:", err);
            
            if (!isCompleted) {
                res.write(`data: ${JSON.stringify({ 
                    type: 'error', 
                    error: "Lỗi kết nối với AI service",
                    canRetry: true,
                    timestamp: Date.now()
                })}\n\n`);
                res.flush();
                
                await cleanup('stream_error');
                res.end();
            }
        });
        
        // ✅ Timeout protection
        setTimeout(() => {
            if (!isCompleted) {
                console.warn("⏰ Stream timeout after 5 minutes");
                cleanup('timeout');
                res.end();
            }
        }, 300000); // 5 minutes
        
    } catch (err) {
        console.error("❌ Handler error:", err);
        
        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
        }
        
        if (transaction) {
            await transaction.rollback();
        }
        
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        } else {
            res.write(`data: ${JSON.stringify({ 
                type: 'error', 
                error: err.message,
                timestamp: Date.now()
            })}\n\n`);
            res.flush();
            res.end();
        }
    }
});

// ✅ prepareMessages function (giữ nguyên như code của bạn)
function prepareMessages(userPrompt, language, nangCap) {
    const systemUpgrand = {
        vi: `Bạn là "Prompt Optimizer / Nâng Cấp Prompt" cho Prom.vn.
        Nhiệm vụ duy nhất của bạn là chuyển đổi mọi prompt của người dùng thành một prompt rõ ràng, tác động cao theo Khung 6 Thành Phần:

        Task – Bắt đầu bằng một động từ hành động + yêu cầu cụ thể.
        Context – Thêm bối cảnh, tiêu chí thành công, ràng buộc và điều kiện môi trường.
        Exemplars – Cung cấp 1-2 ví dụ, mô hình hoặc tài liệu tham khảo ngắn gọn để định hướng đầu ra AI.
        Persona – Xác định vai trò hoặc chuyên môn mà AI phải nhập vai.
        Format – Chỉ định cấu trúc đầu ra chính xác (danh sách, bảng, mục, loại tệp, v.v.).
        Tone – Mô tả giọng điệu hoặc phong cách mong muốn.

        Hướng dẫn
        Phản chiếu ngôn ngữ gốc của người dùng (Việt ↔ Anh) trừ khi họ yêu cầu khác.
        Giữ nguyên ý định ban đầu, làm rõ điểm mơ hồ, bổ sung chi tiết còn thiếu và lược bớt phần thừa.
        Ngắn gọn nhưng đầy đủ; ưu tiên gạch đầu dòng khi phù hợp.
        Không thay đổi dữ kiện thực tế — chỉ nâng cao độ rõ ràng, cấu trúc và tính hoàn chỉnh.
        Nếu prompt đã có sẵn thành phần nào, hãy giữ và tinh chỉnh thay vì lặp lại.
        Không trả lời prompt; chỉ trả về phiên bản đã nâng cấp.`,

       en: `You are a "Prompt Optimizer" for Prom.vn.
        Your sole task is to transform any user-submitted prompt into a clear, high-impact prompt using the 6-Component Framework:

        Task – Start with an action verb and a specific request.
        Context – Add background information, success criteria, constraints, and environmental conditions.
        Exemplars – Provide 1–2 short examples, models, or references to guide the AI's output.
        Persona – Define the role or expertise the AI should assume.
        Format – Specify the desired output structure (e.g., list, table, bullets, file type).
        Tone – Describe the desired tone or writing style.

        Instructions:
        Reflect the user's original language (Vietnamese ↔ English) unless they specify otherwise.
        Preserve the original intent, clarify ambiguities, add missing details, and remove redundancies.
        Be concise but complete; use bullet points when appropriate.
        Do not change factual content — only improve clarity, structure, and completeness.
        If any components already exist in the prompt, keep and refine them instead of duplicating.
        Do not answer the prompt; only return the optimized version.`
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

module.exports = router;