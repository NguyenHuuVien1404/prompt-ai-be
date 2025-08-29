const { parentPort, workerData } = require("worker_threads");
const XLSX = require("xlsx");
const sequelize = require("../config/database");
const { Prompt, Category, Topic } = require("../models");

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
    const headers = jsonData[0];
    const rows = jsonData.slice(1);

    // Excel file analysis completed

    // Kiểm tra nếu không có dữ liệu
    if (!headers || headers.length === 0) {
      throw new Error("No headers found in Excel file");
    }

    if (!rows || rows.length === 0) {
      throw new Error("No data rows found in Excel file");
    }

    // Get existing categories and topics for reference
    const existingCategories = await Category.findAll({
      attributes: ["name"],
      raw: true,
    });
    const existingTopics = await Topic.findAll({
      attributes: ["name"],
      raw: true,
    });

    // Format content function
    const formatContent = (text, header) => {
      if (!text) return "";
      if (header === "category" || header === "topic" || header === "title") {
        return text.trim();
      }
      if (text.includes("●")) {
        const items = text
          .split("●")
          .filter((item) => item.trim())
          .map((item) => `<p>${item.trim()}</p>`);
        return items.join("");
      }
      return `<p>${text.trim()}</p>`;
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
          console.log(`Row ${rowIndex + 1}: Empty row, skipping`);
          continue;
        }

        // Processing row ${rowIndex + 1}

        const promptData = {};
        headers.forEach((header, index) => {
          promptData[header] = formatContent(row[index], header);
        });

        // Data formatted successfully

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
          console.warn("Row data:", promptData);

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
          const errorMessage = `Row ${rowIndex + 1}: Category "${
            promptData?.category
          }" không tồn tại trong hệ thống. Vui lòng tạo category trước khi import.`;
          console.error(errorMessage);

          skippedRecords.push({
            row: rowIndex + 1,
            reason: `Category "${promptData?.category}" không tồn tại`,
            data: promptData,
            error: errorMessage,
          });
          continue; // Bỏ qua row này
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

        // Add IDs to prompt data
        promptData.category_id = category.id;
        promptData.topic_id = topic.id;
        promptData.topic_name = topic.name; // Store topic name for summary
        promptData.is_type = 1;
        prompts.push(promptData);

        // Row ${rowIndex + 1} prepared successfully for insertion
      }

      // Summary: ${prompts.length} prompts to insert, ${skippedRecords.length} rows skipped
      console.log(`\n=== IMPORT SUMMARY ===`);
      console.log(`Total rows in Excel: ${rows.length}`);
      console.log(`Rows prepared for insertion: ${prompts.length}`);
      console.log(`Rows skipped: ${skippedRecords.length}`);
      console.log(`Rows successfully inserted: ${insertedRecords.length}`);

      // Collect missing categories and topics for summary
      const missingCategories = new Set();
      const missingTopics = new Set();
      const missingFields = new Set();
      const autoCreatedTopics = new Set();

      skippedRecords.forEach((record) => {
        if (record.reason.includes("Category")) {
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

      // Count auto-created topics from successful processing
      prompts.forEach((prompt) => {
        if (prompt.topic_id && prompt.topic_name) {
          autoCreatedTopics.add(prompt.topic_name);
        }
      });

      // Log missing categories and topics summary
      if (missingCategories.size > 0) {
        console.log(`\n=== MISSING CATEGORIES (${missingCategories.size}) ===`);
        console.log("Categories that need to be created:");
        Array.from(missingCategories)
          .sort()
          .forEach((cat) => {
            console.log(`  - "${cat}"`);
          });
      }

      if (autoCreatedTopics.size > 0) {
        console.log(
          `\n=== AUTO-CREATED TOPICS (${autoCreatedTopics.size}) ===`
        );
        console.log("Topics that were automatically created:");
        Array.from(autoCreatedTopics)
          .sort()
          .forEach((topic) => {
            console.log(`  - "${topic}"`);
          });
      }

      if (missingTopics.size > 0) {
        console.log(`\n=== MISSING TOPICS (${missingTopics.size}) ===`);
        console.log(
          "Topics that couldn't be auto-created (need manual creation):"
        );
        Array.from(missingTopics)
          .sort()
          .forEach((topic) => {
            console.log(`  - "${topic}"`);
          });
      }

      if (missingFields.size > 0) {
        console.log(`\n=== MISSING REQUIRED FIELDS ===`);
        console.log("Fields that are missing in Excel:");
        Array.from(missingFields)
          .sort()
          .forEach((field) => {
            console.log(`  - "${field}"`);
          });
      }

      if (skippedRecords.length > 0) {
        console.log("\n=== SKIPPED RECORDS DETAILS ===");
        console.log(
          `First 10 skipped records (showing max 10 for readability):`
        );
        skippedRecords.slice(0, 10).forEach((record) => {
          console.log(`\nRow ${record.row}: ${record.reason}`);
          console.log("  Data:", record.data);
          if (record.error) {
            console.log("  Error:", record.error);
          }
        });

        if (skippedRecords.length > 10) {
          console.log(
            `\n... and ${skippedRecords.length - 10} more skipped records`
          );
        }
      }

      // Bulk insert
      if (prompts.length > 0) {
        const promptRecords = prompts.map((p) => ({
          short_description: p.short_description || "No description provided",
          category_id: p.category_id,
          topic_id: p.topic_id,
          title: p.title || "No title provided",
          is_type: p.is_type || 1,
          content: p.short_description || "No content provided",
          what: p.what || null,
          created_at: new Date(),
          updated_at: new Date(),
          tips: p.tips || null,
          text: p.text || null,
          OptimationGuide: p.OptimationGuide || null,
          how: p.how || null,
        }));

        // Inserting ${promptRecords.length} records...

        const createdPrompts = await Prompt.bulkCreate(promptRecords, {
          transaction,
        });

        // Successfully created ${createdPrompts.length} prompts

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
      // Transaction committed successfully

      // Tạo message tùy theo kết quả
      let message = "";
      const autoCreatedCount = autoCreatedTopics.size;

      if (prompts.length > 0 && skippedRecords.length === 0) {
        if (autoCreatedCount > 0) {
          message = `Import thành công! ${prompts.length} records đã được xử lý. ${autoCreatedCount} topics mới đã được tạo tự động.`;
        } else {
          message = `Import thành công! ${prompts.length} records đã được xử lý.`;
        }
      } else if (prompts.length > 0 && skippedRecords.length > 0) {
        if (autoCreatedCount > 0) {
          message = `Import một phần thành công! ${prompts.length} records đã được xử lý (${autoCreatedCount} topics mới được tạo), ${skippedRecords.length} records bị bỏ qua.`;
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
