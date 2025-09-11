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
              attributes: ["id", "name"],
              through: { attributes: [] },
            },
          ],
        },
        {
          model: Topic,
          attributes: ["id", "name"],
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

    // Add header row
    const headers = [
      "ID",
      "Title",
      "Short Description",
      "Content",
      "Category",
      "Topic",
      "Industry",
      "What",
      "Tips",
      "Text",
      "How",
      "Input",
      "Output",
      "Optimization Guide",
      "Add Tip",
      "Add Information",
      "Is Type",
      "Sub Type",
      "Sum View",
      "Created At",
      "Updated At",
    ];

    excelData.push(headers);

    // Add data rows
    prompts.forEach((prompt) => {
      const row = [
        prompt.id,
        prompt.title || "",
        prompt.short_description || "",
        prompt.content || "",
        prompt.Category ? prompt.Category.name : "",
        prompt.Topic ? prompt.Topic.name : "",
        prompt.Category &&
        prompt.Category.industries &&
        prompt.Category.industries.length > 0
          ? prompt.Category.industries
              .map((industry) => industry.name)
              .join(", ")
          : "",
        prompt.what || "",
        prompt.tips || "",
        prompt.text || "",
        prompt.how || "",
        prompt.input || "",
        prompt.output || "",
        prompt.OptimationGuide || "",
        prompt.addtip || "",
        prompt.addinformation || "",
        prompt.is_type || 1,
        prompt.sub_type || 1,
        prompt.sum_view || 0,
        prompt.created_at ? new Date(prompt.created_at).toISOString() : "",
        prompt.updated_at ? new Date(prompt.updated_at).toISOString() : "",
      ];

      excelData.push(row);
    });

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);

    // Set column widths
    const columnWidths = [
      { wch: 8 }, // ID
      { wch: 30 }, // Title
      { wch: 50 }, // Short Description
      { wch: 100 }, // Content
      { wch: 20 }, // Category
      { wch: 20 }, // Topic
      { wch: 25 }, // Industry
      { wch: 100 }, // What
      { wch: 100 }, // Tips
      { wch: 100 }, // Text
      { wch: 100 }, // How
      { wch: 100 }, // Input
      { wch: 100 }, // Output
      { wch: 100 }, // Optimization Guide
      { wch: 100 }, // Add Tip
      { wch: 100 }, // Add Information
      { wch: 10 }, // Is Type
      { wch: 10 }, // Sub Type
      { wch: 10 }, // Sum View
      { wch: 20 }, // Created At
      { wch: 20 }, // Updated At
    ];

    worksheet["!cols"] = columnWidths;

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Prompts");

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

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
      attributes: ["id", "name"],
      limit: 5,
    });

    // Prepare template data
    const templateData = [];

    // Add header row
    const headers = [
      "title",
      "short_description",
      "content",
      "category",
      "topic",
      "industry",
      "what",
      "tips",
      "text",
      "how",
      "input",
      "output",
      "OptimationGuide",
      "addtip",
      "addinformation",
      "is_type",
      "sub_type",
    ];

    templateData.push(headers);

    // Add sample data rows
    const sampleRows = [
      [
        "Sample Prompt Title",
        "This is a short description of the prompt",
        "This is the main content of the prompt",
        categories[0] ? categories[0].name : "Sample Category",
        topics[0] ? topics[0].name : "Sample Topic",
        industries[0] ? industries[0].name : "Sample Industry",
        "What this prompt does",
        "Tips for using this prompt",
        "Additional text information",
        "How to use this prompt",
        "Input example",
        "Expected output",
        "Optimization guide",
        "Additional tips",
        "Additional information",
        1,
        1,
      ],
      [
        "Another Sample Title",
        "Another short description",
        "Another content example",
        categories[1] ? categories[1].name : "Another Category",
        topics[1] ? topics[1].name : "Another Topic",
        industries[1] ? industries[1].name : "Another Industry",
        "What this does",
        "More tips",
        "More text",
        "How to use",
        "Input example 2",
        "Output example 2",
        "Guide 2",
        "Tips 2",
        "Info 2",
        1,
        2,
      ],
    ];

    templateData.push(...sampleRows);

    // Add instructions row
    const instructionsRow = [
      "INSTRUCTIONS:",
      "Fill in the required fields (title, category, topic)",
      "Industry is optional but recommended",
      "Use existing category/topic/industry names or they will be created automatically",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "1 = free, 2 = premium",
      "1 = basic, 2 = advanced",
    ];

    templateData.push(instructionsRow);

    // Create workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(templateData);

    // Set column widths
    const columnWidths = [
      { wch: 30 }, // title
      { wch: 50 }, // short_description
      { wch: 100 }, // content
      { wch: 20 }, // category
      { wch: 20 }, // topic
      { wch: 25 }, // industry
      { wch: 100 }, // what
      { wch: 100 }, // tips
      { wch: 100 }, // text
      { wch: 100 }, // how
      { wch: 100 }, // input
      { wch: 100 }, // output
      { wch: 100 }, // OptimationGuide
      { wch: 100 }, // addtip
      { wch: 100 }, // addinformation
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
