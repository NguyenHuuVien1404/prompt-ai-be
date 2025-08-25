const { parentPort, workerData } = require("worker_threads");
const XLSX = require("xlsx");
const sequelize = require("../config/database");
const { Prompt, Category, Topic } = require("../models");

// Function to process Excel file
async function processExcelFile(filePath) {
  try {
    console.log("Starting Excel processing for file:", filePath);
    
    // Kiểm tra file có tồn tại không
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the Excel file
    const workbook = XLSX.readFile(filePath);
    console.log("Workbook loaded, sheets:", workbook.SheetNames);
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      throw new Error(`No worksheet found in Excel file`);
    }

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    const headers = jsonData[0];
    const rows = jsonData.slice(1);

    console.log("Headers:", headers);
    console.log("Total rows:", rows.length);
    console.log("First row sample:", rows[0]);

    // Kiểm tra nếu không có dữ liệu
    if (!headers || headers.length === 0) {
      throw new Error("No headers found in Excel file");
    }

    if (!rows || rows.length === 0) {
      throw new Error("No data rows found in Excel file");
    }

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
    const transaction = await sequelize.transaction();

    try {
      for (const row of rows) {
        if (!row || row.length === 0) continue;
        
        const promptData = {};
        headers.forEach((header, index) => {
          promptData[header] = formatContent(row[index], header);
        });

        console.log("Processing row:", promptData);

        // Kiểm tra dữ liệu bắt buộc
        if (!promptData.category || !promptData.topic || !promptData.title) {
          console.warn("Skipping row - missing required fields:", promptData);
          continue;
        }

        // Process category
        let category = await Category.findOne({
          where: { name: promptData?.category },
          transaction,
        });

        if (!category) {
          category = await Category.create(
            { name: promptData?.category },
            { transaction }
          );
          console.log("Created new category:", category.name);
        }

        // Process topic
        let topic = await Topic.findOne({
          where: { name: promptData?.topic },
          transaction,
        });

        if (!topic) {
          topic = await Topic.create(
            { name: promptData?.topic },
            { transaction }
          );
          console.log("Created new topic:", topic.name);
        }

        // Add IDs to prompt data
        promptData.category_id = category.id;
        promptData.topic_id = topic.id;
        promptData.is_type = 1;
        prompts.push(promptData);
      }

      console.log("Total prompts to insert:", prompts.length);

      // Bulk insert
      if (prompts.length > 0) {
        const promptRecords = prompts.map((p) => ({
          short_description: p.short_description || "No description provided",
          category_id: p.category_id,
          topic_id: p.topic_id,
          title: p.title || "No title provided",
          is_type: p.is_type || 1,
          content: p.short_description || "No content provided", // Sửa lỗi này
          what: p.what || null,
          created_at: new Date(),
          updated_at: new Date(),
          tips: p.tips || null,
          text: p.text || null,
          OptimationGuide: p.OptimationGuide || null,
          how: p.how || null,
        }));

        console.log("Inserting prompt records:", promptRecords.length);
        
        const createdPrompts = await Prompt.bulkCreate(promptRecords, {
          transaction,
        });
        console.log("Successfully created prompts:", createdPrompts.length);
      }

      // Commit transaction
      await transaction.commit();
      console.log("Transaction committed successfully");

      parentPort.postMessage({
        success: true,
        count: prompts.length,
        data: prompts,
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
