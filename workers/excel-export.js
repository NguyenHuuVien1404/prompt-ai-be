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

// Function to export prompts to Excel
async function exportPromptsToExcel(filters = {}) {
  try {
    // Build query options
    const queryOptions = {
      include: [
        {
          model: Category,
          attributes: ["id", "name"],
          include: [
            {
              model: Industry,
              as: "industries",
              attributes: ["id", "name", "description"],
              through: { attributes: [] },
            },
          ],
        },
        {
          model: Topic,
          as: "topic",
          attributes: ["id", "name"],
          required: false, // LEFT JOIN để không bị mất prompt khi không có topic
        },
      ],
      order: [["created_at", "DESC"]],
    };

    // Apply filters
    if (filters.categoryId) {
      queryOptions.where = { category_id: filters.categoryId };
    }

    if (filters.industryId) {
      queryOptions.include[0].include[0].where = { id: filters.industryId };
      queryOptions.include[0].include[0].required = true;
    }

    if (filters.topicId) {
      queryOptions.where = { ...queryOptions.where, topic_id: filters.topicId };
    }

    if (filters.subType) {
      queryOptions.where = { ...queryOptions.where, sub_type: filters.subType };
    }

    if (filters.isType) {
      queryOptions.where = { ...queryOptions.where, is_type: filters.isType };
    }

    if (filters.search) {
      const { Op } = require("sequelize");
      queryOptions.where = {
        ...queryOptions.where,
        [Op.or]: [
          { title: { [Op.like]: `%${filters.search}%` } },
          { content: { [Op.like]: `%${filters.search}%` } },
          { short_description: { [Op.like]: `%${filters.search}%` } },
        ],
      };
    }

    // Limit results if specified
    if (filters.limit) {
      queryOptions.limit = parseInt(filters.limit);
    }

    // Fetch prompts
    const prompts = await Prompt.findAll(queryOptions);

    // Prepare data for Excel
    const excelData = [];

    // Add header row - chỉ các field được yêu cầu
    const headers = [
      "id",
      "title",
      "short_description",
      "content",
      "category",
      "topic",
      "industry",
      "text",
      "optimization_guide",
      "is_type",
      "sub_type",
    ];

    excelData.push(headers);

    // Helper function to strip HTML tags for clean export
    const stripHtmlTags = (content) => {
      if (!content) return "";
      return String(content)
        .replace(/<[^>]*>/g, "")
        .trim();
    };

    // Add data rows
    prompts.forEach((prompt) => {
      const industryNames =
        prompt.Category &&
        prompt.Category.industries &&
        prompt.Category.industries.length > 0
          ? prompt.Category.industries
              .map((industry) => industry.name)
              .join(", ")
          : "";

      const row = [
        prompt.id,
        stripHtmlTags(prompt.title) || "",
        stripHtmlTags(prompt.short_description) || "",
        stripHtmlTags(prompt.content) || "",
        prompt.Category ? prompt.Category.name : "",
        prompt.topic ? prompt.topic.name : "",
        industryNames, // Industries separated by comma
        stripHtmlTags(prompt.text) || "",
        stripHtmlTags(prompt.OptimationGuide) || "",
        prompt.is_type || 1,
        prompt.sub_type || 1,
      ];

      excelData.push(row);
    });

    // Check if we have any data
    if (excelData.length <= 1) {
      parentPort.postMessage({
        success: false,
        error: "No data to export",
      });
      return;
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);

    // Set column widths
    const columnWidths = [
      { wch: 8 }, // id
      { wch: 30 }, // title
      { wch: 50 }, // short_description
      { wch: 100 }, // content
      { wch: 20 }, // category
      { wch: 20 }, // topic
      { wch: 25 }, // industry
      { wch: 100 }, // text
      { wch: 100 }, // optimization_guide
      { wch: 10 }, // is_type
      { wch: 10 }, // sub_type
    ];

    worksheet["!cols"] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Prompts");

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // Validate buffer
    if (!Buffer.isBuffer(excelBuffer) || excelBuffer.length === 0) {
      parentPort.postMessage({
        success: false,
        error: "Failed to generate Excel buffer",
      });
      return;
    }

    parentPort.postMessage({
      success: true,
      data: excelBuffer,
      count: prompts.length,
      message: `Successfully exported ${prompts.length} prompts to Excel`,
    });
  } catch (error) {
    console.error("Error in exportPromptsToExcel:", error);
    parentPort.postMessage({
      success: false,
      error: error.message,
    });
  }
}

// Function to create Excel template
async function createExcelTemplate() {
  try {
    // Get sample data for template
    const categories = await Category.findAll({
      attributes: ["id", "name"],
      limit: 5,
    });

    const topics = await Topic.findAll({
      attributes: ["id", "name"],
      limit: 5,
    });

    const industries = await Industry.findAll({
      attributes: ["id", "name", "description"],
      limit: 5,
    });

    // Prepare template data
    const templateData = [];

    // Add header row
    const headers = [
      "id",
      "title",
      "short_description",
      "content",
      "category",
      "topic",
      "industry",
      "text",
      "optimization_guide",
      "is_type",
      "sub_type",
    ];

    templateData.push(headers);

    // Add sample data rows
    const sampleRows = [
      [
        "", // ID - leave empty for new records
        "Sample Prompt Title",
        "This is a short description of the prompt",
        "This is the main content of the prompt",
        categories[0] ? categories[0].name : "Sample Category",
        topics[0] ? topics[0].name : "Sample Topic",
        industries[0] ? industries[0].name : "Sample Industry",
        "Additional text information",
        "Optimization guide",
        1,
        1,
      ],
      [
        1, // ID - existing record for update
        "Another Sample Title",
        "Another short description",
        "Another content example",
        categories[1] ? categories[1].name : "Another Category",
        topics[1] ? topics[1].name : "Another Topic",
        industries[1]
          ? industries[1].name +
            ", " +
            (industries[2] ? industries[2].name : "Another Industry")
          : "Another Industry",
        "More text",
        "Guide 2",
        1,
        2,
      ],
    ];

    templateData.push(...sampleRows);

    // Add instructions row
    const instructionsRow = [
      "INSTRUCTIONS:",
      "ID: Leave empty for new records, fill with existing ID for updates",
      "Fill in the required fields (title, category, topic)",
      "Industry: Optional, separate multiple industries with comma (e.g., 'E-commerce, Healthcare')",
      "Use existing category/topic/industry names or they will be created automatically",
      "",
      "",
      "",
      "is_type: 1 = free, 2 = premium",
      "sub_type: 1 = basic, 2 = advanced",
    ];

    templateData.push(instructionsRow);

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Set column widths
    const columnWidths = [
      { wch: 8 }, // id
      { wch: 30 }, // title
      { wch: 50 }, // short_description
      { wch: 100 }, // content
      { wch: 20 }, // category
      { wch: 20 }, // topic
      { wch: 25 }, // industry
      { wch: 100 }, // text
      { wch: 100 }, // optimization_guide
      { wch: 10 }, // is_type
      { wch: 10 }, // sub_type
    ];

    worksheet["!cols"] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    parentPort.postMessage({
      success: true,
      data: excelBuffer,
      message: "Excel template created successfully",
    });
  } catch (error) {
    console.error("Error in createExcelTemplate:", error);
    parentPort.postMessage({
      success: false,
      error: error.message,
    });
  }
}

// Start processing based on worker data
if (workerData.action === "export") {
  exportPromptsToExcel(workerData.filters);
} else if (workerData.action === "template") {
  createExcelTemplate();
} else {
  parentPort.postMessage({
    success: false,
    error: "Invalid action. Use 'export' or 'template'",
  });
}
