const express = require("express");
const router = express.Router();
const axios = require("axios");
const User = require("../models/User");
const History = require("../models/History");
const { authMiddleware } = require("../middleware/authMiddleware");
const sequelize = require("../config/database");
const { prepareMessages } = require("../utils/promptUtils");

// ✅ Fix typo trong env variable name
const OPENROUTER_API_KEY = process.env.OPENT_ROUTER_API_KEY; // Sửa từ OPENT_ROUTER_API_KEY

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ✅ StreamBuffer Class
class StreamBuffer {
  constructor() {
    this.buffer = "";
  }

  addChunk(chunk) {
    const chunkStr = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    this.buffer += chunkStr;

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    return lines.filter((line) => line.trim());
  }

  flush() {
    const remaining = this.buffer.trim();
    this.buffer = "";
    return remaining ? [remaining] : [];
  }
}

// ✅ Parse SSE Data Function
function parseSSEData(line) {
  try {
    let data = line.trim();

    if (data.startsWith("data: ")) {
      data = data.substring(6);
    }

    if (data === "[DONE]") {
      return { type: "done" };
    }

    if (!data.startsWith("{")) {
      return { type: "skip" };
    }

    const parsed = JSON.parse(data);

    if (!parsed.choices || !Array.isArray(parsed.choices)) {
      return { type: "skip" };
    }

    const choice = parsed.choices[0];
    if (!choice || !choice.delta) {
      return { type: "skip" };
    }

    const content = choice.delta.content;
    if (typeof content === "string") {
      return { type: "content", content: content };
    }

    return { type: "skip" };
  } catch (error) {
    return { type: "error", error: error.message };
  }
}

// ✅ Improved OpenRouter API call
async function callGPTWithStream(messages, model) {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 4000,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
            "X-Title": "Prom.vn AI Assistant",
          },
          responseType: "stream",
          timeout: 60000, // 60s timeout
          decompress: false,
          maxRedirects: 0,
        }
      );
      return response;
    } catch (error) {
      attempts++;

      if (error.response?.status === 429 && attempts < maxAttempts) {
        const delayTime = Math.min(2000 * attempts, 10000);

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
router.post(
  "/gpt-stream",
  (req, res, next) => {
    req._noCompression = true;
    res.set("X-Accel-Buffering", "no");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    next();
  },
  authMiddleware,
  async (req, res) => {
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
        return res
          .status(400)
          .json({ error: "userPrompt không được để trống" });
      }

      if (userPrompt.length > 10000) {
        return res
          .status(400)
          .json({ error: "userPrompt quá dài (tối đa 10,000 ký tự)" });
      }

      transaction = await sequelize.transaction();

      let cost;
      switch (model) {
        case "gpt-4o":
        case "gpt-4-turbo":
          cost = 5;
          break;
        case "gpt-5":
        case "gpt-5-mini":
          cost = 4;
          break;
        default:
          cost = 1;
          break;
      }
      const userId = req.user.id;

      const user = await User.findByPk(userId, {
        transaction,
        lock: true, // ✅ Prevent race condition
      });

      if (!user || user.count_promt < cost) {
        await transaction.rollback();
        return res.status(403).json({
          error: "Không đủ credit",
          required: cost,
          available: user?.count_promt || 0,
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
      res.write(
        `data: ${JSON.stringify({
          type: "connected",
          timestamp: Date.now(),
          model: model,
          cost: cost,
        })}\n\n`
      );
      res.flush();

      // ✅ Setup heartbeat interval
      heartbeatInterval = setInterval(() => {
        if (!isCompleted && Date.now() - lastHeartbeat > 30000) {
          res.write(`: heartbeat ${Date.now()}\n\n`);
          res.flush();
        }
      }, 15000);

      // ✅ Cleanup function
      const cleanup = async (reason = "unknown") => {
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }

        if (!isCompleted && transaction) {
          try {
            await transaction.rollback();
          } catch (err) {
            // Rollback error handled silently
          }
        }
      };

      // ✅ Handle client disconnect
      req.on("close", () => cleanup("client_disconnect"));
      req.on("aborted", () => cleanup("client_abort"));

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
          await History.create(
            {
              user_id: userId,
              title: title || userPrompt.substring(0, 50),
              request: userPrompt,
              respone: fullResponse,
              model: model,
              cost: cost,
              chunks_received: chunkCount,
            },
            { transaction }
          );

          await transaction.commit();

          // Send completion data
          const completionData = {
            type: "completed",
            totalChunks: chunkCount,
            totalLength: fullResponse.length,
            checksum: Buffer.from(fullResponse).toString("base64").slice(-10),
            cost: cost,
            remainingCredits: user.count_promt,
            timestamp: Date.now(),
          };

          res.write(`data: ${JSON.stringify(completionData)}\n\n`);
          res.write(`data: [DONE]\n\n`);
          res.flush();
          res.end();
        } catch (err) {
          if (transaction) {
            await transaction.rollback();
          }

          res.write(
            `data: ${JSON.stringify({
              type: "error",
              error: "Lỗi lưu dữ liệu: " + err.message,
              timestamp: Date.now(),
            })}\n\n`
          );
          res.flush();
          res.end();
        }
      }

      // ✅ Call OpenRouter API
      const messages = prepareMessages(
        userPrompt,
        language,
        nangCap,
        req.body.type
      );

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
              case "content":
                fullResponse += result.content;

                const payload = {
                  type: "content",
                  content: result.content,
                  chunkId: chunkCount,
                  totalLength: fullResponse.length,
                  timestamp: Date.now(),
                };

                res.write(`data: ${JSON.stringify(payload)}\n\n`);
                res.flush();
                break;

              case "done":
                handleCompletion();
                return;

              case "error":
                break;
            }
          }
        } catch (err) {
          // Chunk processing error handled silently
        }
      });

      // ✅ Handle stream end
      stream.data.on("end", () => {
        if (!isCompleted) {
          const remainingLines = streamBuffer.flush();
          for (const line of remainingLines) {
            const result = parseSSEData(line);
            if (result.type === "content") {
              fullResponse += result.content;
            }
          }

          handleCompletion();
        }
      });

      // ✅ Handle stream error
      stream.data.on("error", async (err) => {
        if (!isCompleted) {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              error: "Lỗi kết nối với AI service",
              canRetry: true,
              timestamp: Date.now(),
            })}\n\n`
          );
          res.flush();

          await cleanup("stream_error");
          res.end();
        }
      });

      // ✅ Timeout protection
      setTimeout(() => {
        if (!isCompleted) {
          cleanup("timeout");
          res.end();
        }
      }, 300000); // 5 minutes
    } catch (err) {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      if (transaction) {
        await transaction.rollback();
      }

      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      } else {
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            error: err.message,
            timestamp: Date.now(),
          })}\n\n`
        );
        res.flush();
        res.end();
      }
    }
  }
);

module.exports = router;
