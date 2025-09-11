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

    // Format content function
    const formatContent = (text, header) => {
      if (!text) return "";

      // Convert to string and trim
      const cleanText = text.toString().trim();

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
      return `<p>${cleanText}</p>`;
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

        // Kiểm tra dữ liệu bắt buộc
        if (!promptData.category || !promptData.topic || !promptData.title) {
          const missingFields = [];
          if (!promptData.category) missingFields.push("category");
          if (!promptData.topic) missingFields.push("topic");
          if (!promptData.title) missingFields.push("title");

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

        // Process category
        let category = await Category.findOne({
          where: { name: promptData?.category },
          transaction,
        });

        if (!category) {
          // Auto-create category if it doesn't exist
          try {
            category = await Category.create(
              {
                name: promptData?.category,
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
            }: Không thể tạo category "${promptData?.category}" - ${
              error.message
            }`;
            console.error(errorMessage);

            skippedRecords.push({
              row: rowIndex + 1,
              reason: `Không thể tạo category "${promptData?.category}"`,
              data: promptData,
              error: errorMessage,
            });
            continue; // Bỏ qua row này
          }
        }

        // Process topic
        let topic = await Topic.findOne({
          where: { name: promptData?.topic },
          transaction,
        });

        if (!topic) {
          // Auto-create topic if it doesn't exist
          try {
            topic = await Topic.create(
              {
                name: promptData?.topic,
                created_at: new Date(),
                updated_at: new Date(),
              },
              { transaction }
            );
          } catch (error) {
            const errorMessage = `Row ${rowIndex + 1}: Không thể tạo topic "${
              promptData?.topic
            }" - ${error.message}`;
            console.error(errorMessage);

            skippedRecords.push({
              row: rowIndex + 1,
              reason: `Không thể tạo topic "${promptData?.topic}"`,
              data: promptData,
              error: errorMessage,
            });
            continue; // Bỏ qua row này
          }
        }

        // Process industry (optional field)
        let industry = null;
        if (promptData.industry && promptData.industry.trim()) {
          industry = await Industry.findOne({
            where: { name: promptData.industry.trim() },
            transaction,
          });

          if (!industry) {
            // Auto-create industry if it doesn't exist
            try {
              industry = await Industry.create(
                {
                  name: promptData.industry.trim(),
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
                }: Could not create industry "${promptData.industry.trim()}" - ${
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
        promptData.is_type = 1;
        prompts.push(promptData);

        // Row prepared successfully for insertion
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

      // Bulk insert
      if (prompts.length > 0) {
        const promptRecords = prompts.map((p) => ({
          short_description: p.short_description || "",
          category_id: p.category_id,
          topic_id: p.topic_id,
          title: p.title || "",
          is_type: p.is_type || 1,
          content: p.short_description || "",
          what: p.what || null,
          created_at: new Date(),
          updated_at: new Date(),
          tips: p.tips || null,
          text: p.text || null,
          OptimationGuide: p.OptimationGuide || null,
          how: p.how || null,
          input: p.input || null,
          output: p.output || null,
          addtip: p.addtip || null,
          addinformation: p.addinformation || null,
          sub_type: p.sub_type || 1,
        }));

        const createdPrompts = await Prompt.bulkCreate(promptRecords, {
          transaction,
        });

        // Store inserted records for response
        insertedRecords.push(
          ...createdPrompts.map((prompt) => ({
            id: prompt.id,
            title: prompt.title,
            category_id: prompt.category_id,
            topic_id: prompt.topic_id,
            short_description: prompt.short_description,
            created_at: prompt.created_at,
          }))
        );
      }

      // Commit transaction
      await transaction.commit();

      // Tạo message tùy theo kết quả
      let message = "";
      const autoCreatedTopicsCount = autoCreatedTopics.size;
      const autoCreatedCategoriesCount = autoCreatedCategories.size;
      const autoCreatedIndustriesCount = autoCreatedIndustries.size;

      if (prompts.length > 0 && skippedRecords.length === 0) {
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
          } records đã được xử lý. ${autoCreatedText.join(
            ", "
          )} mới đã được tạo tự động.`;
        } else {
          message = `Import thành công! ${prompts.length} records đã được xử lý.`;
        }
      } else if (prompts.length > 0 && skippedRecords.length > 0) {
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
          } records đã được xử lý (${autoCreatedText.join(
            ", "
          )} mới được tạo), ${skippedRecords.length} records bị bỏ qua.`;
        } else {
          message = `Import một phần thành công! ${prompts.length} records đã được xử lý, ${skippedRecords.length} records bị bỏ qua.`;
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
          insertedRows: insertedRecords.length,
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
