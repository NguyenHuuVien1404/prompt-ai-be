const { parentPort, workerData } = require("worker_threads");
const XLSX = require("xlsx");
const sequelize = require("../config/database");
const {
  Prompt,
  Category,
  Topic,
  Industry,
  CategoryIndustry,
} = require("../models");

// Function to process Excel file
async function processExcelFile(filePath) {
  try {
    // Starting Excel processing for file: ${filePath}

    // Kiểm tra file có tồn tại không
    const fs = require("fs");
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    // Workbook loaded successfully

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error(`No worksheet found in Excel file`);
    }

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const headers = jsonData[0].map((header) =>
      header ? header.toString().trim() : ""
    );
    const rows = jsonData.slice(1);

    // Excel file analysis completed

    // Kiểm tra nếu không có dữ liệu
    if (!headers || headers.length === 0) {
      throw new Error("No headers found in Excel file");
    }

    if (!rows || rows.length === 0) {
      throw new Error("No data rows found in Excel file");
    }

    // Get existing categories, topics, and industries for reference
    const existingCategories = await Category.findAll({
      attributes: ["name"],
      raw: true,
    });
    const existingTopics = await Topic.findAll({
      attributes: ["name"],
      raw: true,
    });
    const existingIndustries = await Industry.findAll({
      attributes: ["name"],
      raw: true,
    });

    // Helper function to strip HTML tags
    const stripHtmlTags = (content) => {
      if (!content) return null;
      return String(content)
        .replace(/<[^>]*>/g, "")
        .trim();
    };

    // Format content function
    const formatContent = (text, header) => {
      if (!text) return "";

      // Strip HTML tags first
      let cleanText = stripHtmlTags(text);

      // Handle different field types
      if (header === "is_type" || header === "sub_type") {
        const intValue = parseInt(cleanText);
        return isNaN(intValue) ? 1 : intValue;
      }

      if (
        header === "category" ||
        header === "topic" ||
        header === "title" ||
        header === "industry"
      ) {
        return cleanText;
      }

      if (cleanText.includes("●")) {
        const items = cleanText
          .split("●")
          .filter((item) => item.trim())
          .map((item) => `<p>${item.trim()}</p>`);
        return items.join("");
      }
      return cleanText; // Không thêm <p> tags nữa để tránh confusion
    };

    // Prepare data
    const prompts = [];
    const insertedRecords = [];
    const skippedRecords = [];
    const transaction = await sequelize.transaction();

    try {
      // Processing rows...

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (!row || row.length === 0) {
          continue;
        }

        // Processing row ${rowIndex + 1}

        const promptData = {};
        headers.forEach((header, index) => {
          const cellValue = row[index];
          promptData[header] = formatContent(cellValue, header);
        });

        // Kiểm tra dữ liệu bắt buộc - sử dụng các tên header có thể có
        const categoryValue =
          promptData.category ||
          promptData["Category Description"] ||
          promptData["category_description"] ||
          promptData.Category;
        const topicValue =
          promptData.topic ||
          promptData["Topic"] ||
          promptData["topic_name"] ||
          promptData.Topic;
        const titleValue =
          promptData.title ||
          promptData["Title"] ||
          promptData["title_name"] ||
          promptData.Title;

        if (!categoryValue || !topicValue || !titleValue) {
          const missingFields = [];
          if (!categoryValue) missingFields.push("category");
          if (!topicValue) missingFields.push("topic");
          if (!titleValue) missingFields.push("title");

          console.warn(
            `Row ${
              rowIndex + 1
            }: Skipping - missing required fields: ${missingFields.join(", ")}`
          );

          skippedRecords.push({
            row: rowIndex + 1,
            reason: `Missing required fields: ${missingFields.join(", ")}`,
            data: promptData,
          });
          continue;
        }

        // Kiểm tra xem có ID không để quyết định update hay insert
        const promptId = promptData.id ? parseInt(promptData.id) : null;
        const isUpdate = promptId && !isNaN(promptId);

        // Process category
        let category = await Category.findOne({
          where: { name: categoryValue },
          transaction,
        });

        if (!category) {
          // Auto-create category if it doesn't exist
          try {
            category = await Category.create(
              {
                name: categoryValue,
                image: "", // Set default empty string
                image_card: "", // Set default empty string
                section_id: 1, // Set default section_id
                created_at: new Date(),
                updated_at: new Date(),
              },
              { transaction }
            );
          } catch (error) {
            const errorMessage = `Row ${
              rowIndex + 1
            }: Không thể tạo category "${categoryValue}" - ${error.message}`;
            console.error(errorMessage);

            skippedRecords.push({
              row: rowIndex + 1,
              reason: `Không thể tạo category "${categoryValue}"`,
              data: promptData,
              error: errorMessage,
            });
            continue; // Bỏ qua row này
          }
        }

        // Process topic
        let topic = await Topic.findOne({
          where: { name: topicValue },
          transaction,
        });

        if (!topic) {
          // Auto-create topic if it doesn't exist
          try {
            topic = await Topic.create(
              {
                name: topicValue,
                created_at: new Date(),
                updated_at: new Date(),
              },
              { transaction }
            );
          } catch (error) {
            const errorMessage = `Row ${
              rowIndex + 1
            }: Không thể tạo topic "${topicValue}" - ${error.message}`;
            console.error(errorMessage);

            skippedRecords.push({
              row: rowIndex + 1,
              reason: `Không thể tạo topic "${topicValue}"`,
              data: promptData,
              error: errorMessage,
            });
            continue; // Bỏ qua row này
          }
        }

        // Process industry (optional field) - normalize industry value
        const industryValue = promptData.industry || promptData.Industry || "";
        let industry = null;
        if (industryValue && industryValue.trim()) {
          industry = await Industry.findOne({
            where: { name: industryValue.trim() },
            transaction,
          });

          if (!industry) {
            // Auto-create industry if it doesn't exist
            try {
              industry = await Industry.create(
                {
                  name: industryValue.trim(),
                  description: null,
                  created_at: new Date(),
                  updated_at: new Date(),
                },
                { transaction }
              );
            } catch (error) {
              console.warn(
                `Row ${
                  rowIndex + 1
                }: Could not create industry "${industryValue.trim()}" - ${
                  error.message
                }`
              );
              // Continue without industry if creation fails
            }
          }

          // Create category-industry relationship if industry exists
          if (industry) {
            try {
              const existingRelation = await CategoryIndustry.findOne({
                where: {
                  category_id: category.id,
                  industry_id: industry.id,
                },
                transaction,
              });

              if (!existingRelation) {
                await CategoryIndustry.create(
                  {
                    category_id: category.id,
                    industry_id: industry.id,
                    created_at: new Date(),
                  },
                  { transaction }
                );
              }
            } catch (error) {
              console.warn(
                `Row ${
                  rowIndex + 1
                }: Could not create category-industry link - ${error.message}`
              );
            }
          }
        }

        // Add IDs to prompt data
        promptData.category_id = category.id;
        promptData.topic_id = topic.id;
        promptData.topic_name = topic.name; // Store topic name for summary
        promptData.category_name = category.name; // Store category name for summary
        promptData.industry_name = industry ? industry.name : null; // Store industry name for summary
        promptData.is_type = promptData.is_type || 1;
        promptData.sub_type = promptData.sub_type || 1;
        promptData.title = titleValue; // Use normalized title value

        // Add operation type for tracking
        promptData.operation = isUpdate ? "update" : "insert";
        promptData.original_id = promptId;
        promptData.rowIndex = rowIndex;

        prompts.push(promptData);

        // Row prepared successfully for processing
      }

      // Collect missing categories, topics, and industries for summary
      const missingCategories = new Set();
      const missingTopics = new Set();
      const missingFields = new Set();
      const autoCreatedTopics = new Set();
      const autoCreatedCategories = new Set();
      const autoCreatedIndustries = new Set();

      skippedRecords.forEach((record) => {
        if (
          record.reason.includes("Category") &&
          !record.reason.includes("Không thể tạo")
        ) {
          // Only count categories that couldn't be auto-created
          const categoryName = record.data.category;
          if (categoryName) missingCategories.add(categoryName);
        } else if (
          record.reason.includes("Topic") &&
          !record.reason.includes("Không thể tạo")
        ) {
          // Only count topics that couldn't be auto-created
          const topicName = record.data.topic;
          if (topicName) missingTopics.add(topicName);
        } else if (record.reason.includes("Missing required fields")) {
          const missing = record.reason.match(/Missing required fields: (.+)/);
          if (missing) {
            missing[1].split(", ").forEach((field) => missingFields.add(field));
          }
        }
      });

      // Count auto-created categories, topics, and industries from successful processing
      prompts.forEach((prompt) => {
        if (prompt.category_id && prompt.category_name) {
          autoCreatedCategories.add(prompt.category_name);
        }
        if (prompt.topic_id && prompt.topic_name) {
          autoCreatedTopics.add(prompt.topic_name);
        }
        if (prompt.industry_name) {
          autoCreatedIndustries.add(prompt.industry_name);
        }
      });

      // Process each prompt (insert or update)
      if (prompts.length > 0) {
        for (const promptData of prompts) {
          try {
            const promptRecord = {
              short_description: promptData.short_description || "",
              category_id: promptData.category_id,
              topic_id: promptData.topic_id,
              title: promptData.title || "",
              is_type: promptData.is_type || 1,
              content: promptData.content || promptData.short_description || "",
              what: promptData.what || null,
              tips: promptData.tips || null,
              text: promptData.text || null,
              OptimationGuide: promptData.optimization_guide || null,
              how: promptData.how || null,
              input: promptData.input || null,
              output: promptData.output || null,
              addtip: promptData.add_tip || null,
              addinformation: promptData.add_information || null,
              sub_type: promptData.sub_type || 1,
              updated_at: new Date(),
            };

            let resultPrompt;

            if (promptData.operation === "update") {
              // Update existing prompt
              const existingPrompt = await Prompt.findByPk(
                promptData.original_id,
                {
                  transaction,
                }
              );

              if (!existingPrompt) {
                console.warn(
                  `Row: Prompt with ID ${promptData.original_id} not found, skipping update`
                );
                skippedRecords.push({
                  row: promptData.rowIndex + 1,
                  reason: `Prompt with ID ${promptData.original_id} not found`,
                  data: promptData,
                });
                continue;
              }

              await existingPrompt.update(promptRecord, { transaction });
              resultPrompt = existingPrompt;
            } else {
              // Insert new prompt
              promptRecord.created_at = new Date();
              resultPrompt = await Prompt.create(promptRecord, { transaction });
            }

            // Store processed records for response
            insertedRecords.push({
              id: resultPrompt.id,
              title: resultPrompt.title,
              category_id: resultPrompt.category_id,
              topic_id: resultPrompt.topic_id,
              short_description: resultPrompt.short_description,
              created_at: resultPrompt.created_at,
              updated_at: resultPrompt.updated_at,
              operation: promptData.operation,
              original_id: promptData.original_id,
            });
          } catch (error) {
            console.error(`Error processing prompt: ${error.message}`);
            skippedRecords.push({
              row: promptData.rowIndex + 1,
              reason: `Error processing: ${error.message}`,
              data: promptData,
              error: error.message,
            });
          }
        }
      }

      // Commit transaction
      await transaction.commit();

      // Count insert and update operations
      const insertCount = insertedRecords.filter(
        (record) => record.operation === "insert"
      ).length;
      const updateCount = insertedRecords.filter(
        (record) => record.operation === "update"
      ).length;

      // Tạo message tùy theo kết quả
      let message = "";
      const autoCreatedTopicsCount = autoCreatedTopics.size;
      const autoCreatedCategoriesCount = autoCreatedCategories.size;
      const autoCreatedIndustriesCount = autoCreatedIndustries.size;

      if (prompts.length > 0 && skippedRecords.length === 0) {
        let operationText = [];
        if (insertCount > 0) operationText.push(`${insertCount} inserted`);
        if (updateCount > 0) operationText.push(`${updateCount} updated`);

        if (
          autoCreatedTopicsCount > 0 ||
          autoCreatedCategoriesCount > 0 ||
          autoCreatedIndustriesCount > 0
        ) {
          let autoCreatedText = [];
          if (autoCreatedCategoriesCount > 0)
            autoCreatedText.push(`${autoCreatedCategoriesCount} categories`);
          if (autoCreatedTopicsCount > 0)
            autoCreatedText.push(`${autoCreatedTopicsCount} topics`);
          if (autoCreatedIndustriesCount > 0)
            autoCreatedText.push(`${autoCreatedIndustriesCount} industries`);
          message = `Import thành công! ${
            prompts.length
          } records đã được xử lý (${operationText.join(
            ", "
          )}). ${autoCreatedText.join(", ")} mới đã được tạo tự động.`;
        } else {
          message = `Import thành công! ${
            prompts.length
          } records đã được xử lý (${operationText.join(", ")}).`;
        }
      } else if (prompts.length > 0 && skippedRecords.length > 0) {
        let operationText = [];
        if (insertCount > 0) operationText.push(`${insertCount} inserted`);
        if (updateCount > 0) operationText.push(`${updateCount} updated`);

        if (
          autoCreatedTopicsCount > 0 ||
          autoCreatedCategoriesCount > 0 ||
          autoCreatedIndustriesCount > 0
        ) {
          let autoCreatedText = [];
          if (autoCreatedCategoriesCount > 0)
            autoCreatedText.push(`${autoCreatedCategoriesCount} categories`);
          if (autoCreatedTopicsCount > 0)
            autoCreatedText.push(`${autoCreatedTopicsCount} topics`);
          if (autoCreatedIndustriesCount > 0)
            autoCreatedText.push(`${autoCreatedIndustriesCount} industries`);
          message = `Import một phần thành công! ${
            prompts.length
          } records đã được xử lý (${operationText.join(
            ", "
          )}, ${autoCreatedText.join(", ")} mới được tạo), ${
            skippedRecords.length
          } records bị bỏ qua.`;
        } else {
          message = `Import một phần thành công! ${
            prompts.length
          } records đã được xử lý (${operationText.join(", ")}), ${
            skippedRecords.length
          } records bị bỏ qua.`;
        }
      } else if (prompts.length === 0 && skippedRecords.length > 0) {
        message = `Import thất bại! Tất cả ${skippedRecords.length} records đều bị bỏ qua.`;
      } else {
        message = "Không có dữ liệu nào được xử lý.";
      }

      parentPort.postMessage({
        success: prompts.length > 0, // Chỉ thành công nếu có ít nhất 1 record được xử lý
        count: prompts.length,
        message: message,
        data: prompts,
        insertedRecords: insertedRecords,
        skippedRecords: skippedRecords,
        summary: {
          totalRows: rows.length,
          processedRows: prompts.length,
          skippedRows: skippedRecords.length,
          insertedRows: insertCount,
          updatedRows: updateCount,
          totalProcessedRows: insertedRecords.length,
        },
      });
    } catch (error) {
      console.error("Error during processing:", error);
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error in processExcelFile:", error);
    parentPort.postMessage({
      success: false,
      error: error.message,
    });
  }
}

// Start processing with the received file path
processExcelFile(workerData.filePath);
