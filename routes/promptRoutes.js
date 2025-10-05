const express = require("express");
const router = express.Router();
const { Op, Sequelize } = require("sequelize");
const Prompt = require("../models/Prompt");
const Category = require("../models/Category");
const Topic = require("../models/Topic");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sequelize = require("../config/database");
const Section = require("../models/Section");
const PromDetails = require("../models/PromDetails");
const {
  authMiddleware,
  adminMiddleware,
} = require("../middleware/authMiddleware");
const checkSubTypeAccess = require("../middleware/subTypeMiddleware");
const Industry = require("../models/Industry");
const CategoryIndustry = require("../models/CategoryIndustry");
const PromptIndustry = require("../models/PromptIndustry");
const {
  sendListResponse,
  sendDetailResponse,
  sendCreateResponse,
  sendUpdateResponse,
  sendDeleteResponse,
  sendErrorResponse,
  sendNotFoundResponse,
  sendInternalErrorResponse,
  calculatePagination,
} = require("../utils/responseUtils");
const { transformToCamelCase } = require("../utils/transformUtils");

// Cấu hình Multer để lưu file vào thư mục "uploads"
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // cb(null, "uploads/"); // Lưu file vào thư mục "uploads"
    cb(null, "/var/www/promvn/uploads/");
  },
  filename: (req, file, cb) => {
    // Tạo tên file duy nhất với timestamp và random
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Chỉ cho phép upload file ảnh (JPG, PNG, GIF, JPEG)
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg", // JPG, JPEG
    "image/png", // PNG
    "image/gif", // GIF
    "image/bmp", // BMP
    "image/webp", // WebP
    "image/tiff", // TIFF
    "image/svg+xml", // SVG
    "image/heic", // HEIC (High-Efficiency Image Container)
    "image/heif", // HEIF (High-Efficiency Image File Format)
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Chấp nhận file hợp lệ
  } else {
    cb(
      new Error(
        "Invalid file type. Only common image formats (JPG, PNG, GIF, BMP, WebP, TIFF, SVG, HEIC, HEIF) are allowed."
      ),
      false
    );
  }
};

// Multer middleware: Cho phép upload ảnh, không quan trọng tên field
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn file tối đa 5MB
});

// Tạo middleware riêng cho Excel files
const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "/var/www/promvn/uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const excelFileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-excel", // .xls
    "application/octet-stream", // Fallback cho một số Excel files
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only Excel files (.xlsx, .xls) are allowed."
      ),
      false
    );
  }
};

const uploadExcel = multer({
  storage: excelStorage,
  fileFilter: excelFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Cho phép truy cập ảnh đã upload với CORS headers
router.use(
  "/upload",
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  },
  express.static("/var/www/promvn/uploads")
);

// Backup route để serve static files nếu nginx không hoạt động
router.use(
  "/static",
  (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  },
  express.static("/var/www/promvn/uploads")
);

// Test route để kiểm tra CORS
router.get("/test-cors", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  sendDetailResponse(
    res,
    { timestamp: new Date().toISOString() },
    "CORS test successful"
  );
});

// API Upload ảnh (tên field nào cũng được)
router.post("/upload", authMiddleware, upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendErrorResponse(
        res,
        "No files uploaded",
        "VALIDATION_ERROR",
        400
      );
    }

    const { runTask } = require("../utils/worker");
    const filePaths = req.files.map((file) => file.path);

    try {
      const result = await runTask("image-processor.js", {
        filePaths,
        host: req.get("host"),
        protocol: req.protocol,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      const imageUrls = req.files.map(
        (file) =>
          `${req.protocol}://${req.get("host")}/api/prompts/upload/${
            file.filename
          }`
      );
      sendCreateResponse(
        res,
        { imageUrls },
        "Files uploaded and processed successfully"
      );
    } catch (error) {
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const imageUrls = req.files.map(
        (file) => `${baseUrl}/api/prompts/upload/${file.filename}`
      );

      sendCreateResponse(
        res,
        { imageUrls },
        "Files uploaded successfully (without optimization)"
      );
    }
  } catch (error) {
    sendInternalErrorResponse(res, "Error uploading files: " + error.message);
  }
});

// Export Excel template
router.get(
  "/export-template",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { runTask } = require("../utils/worker");

      try {
        const result = await runTask("excel-export.js", {
          action: "template",
        });

        if (!result.success) {
          return sendErrorResponse(
            res,
            result.error || "Failed to create Excel template",
            "VALIDATION_ERROR",
            400
          );
        }

        // Set headers for file download
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=prompts-template.xlsx"
        );
        res.setHeader("Content-Length", result.data.length);

        // Ensure we send the buffer correctly
        if (Buffer.isBuffer(result.data)) {
          res.send(result.data);
        } else {
          res.send(Buffer.from(result.data));
        }
      } catch (error) {
        sendInternalErrorResponse(
          res,
          "Error creating Excel template: " + error.message
        );
      }
    } catch (error) {
      sendInternalErrorResponse(
        res,
        "Error creating Excel template: " + error.message
      );
    }
  }
);

// Export prompts to Excel
router.get(
  "/export-excel",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { runTask } = require("../utils/worker");

      // Get filters from query parameters - support arrays
      const filters = {};

      // Handle categoryId/categoryIds (support array format)
      if (
        req.query.categoryIds ||
        req.query.categoryId ||
        req.query.category_id
      ) {
        const categoryIds =
          req.query.categoryIds ||
          req.query.categoryId ||
          req.query.category_id;
        filters.categoryId = Array.isArray(categoryIds)
          ? categoryIds
          : [categoryIds];
      }

      // Handle industryId/industryIds
      if (
        req.query.industryIds ||
        req.query.industryId ||
        req.query.industry_id
      ) {
        const industryIds =
          req.query.industryIds ||
          req.query.industryId ||
          req.query.industry_id;
        filters.industryId = Array.isArray(industryIds)
          ? industryIds
          : [industryIds];
      }

      // Handle topicId/topicIds
      if (req.query.topicIds || req.query.topicId || req.query.topic_id) {
        const topicIds =
          req.query.topicIds || req.query.topicId || req.query.topic_id;
        filters.topicId = Array.isArray(topicIds) ? topicIds : [topicIds];
      }

      // Handle other filters
      if (req.query.subType || req.query.sub_type) {
        filters.subType = req.query.subType || req.query.sub_type;
      }
      if (req.query.isType || req.query.is_type) {
        filters.isType = req.query.isType || req.query.is_type;
      }
      // Handle search - support multiple parameter names
      if (req.query.search || req.query.searchTerm || req.query.search_text) {
        filters.search =
          req.query.search || req.query.searchTerm || req.query.search_text;
      }
      if (req.query.limit) {
        filters.limit = req.query.limit;
      }
      if (req.query.dateFrom) {
        filters.dateFrom = req.query.dateFrom;
      }
      if (req.query.dateTo) {
        filters.dateTo = req.query.dateTo;
      }

      try {
        const result = await runTask("excel-export.js", {
          action: "export",
          filters: filters,
        });

        if (!result.success) {
          return res.status(400).json({
            success: false,
            message: result.error || "Failed to export prompts to Excel",
          });
        }

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `prompts-export-${timestamp}.xlsx`;

        // Set headers for file download
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}`
        );
        res.setHeader("Content-Length", result.data.length);

        // Ensure we send the buffer correctly
        if (Buffer.isBuffer(result.data)) {
          res.send(result.data);
        } else {
          res.send(Buffer.from(result.data));
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Error exporting prompts to Excel",
          error: error.message,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error exporting prompts to Excel",
        error: error.message,
      });
    }
  }
);

// Test export Excel (simple version)
router.get(
  "/export-excel-test",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const XLSX = require("xlsx");

      // Create simple test data
      const testData = [
        [
          "ID",
          "Title",
          "Description",
          "Category",
          "Industry",
          "Industry Description",
        ],
        [
          1,
          "Test Prompt 1",
          "This is a test prompt",
          "Test Category",
          "Test Industry",
          "Test Industry Description",
        ],
        [
          2,
          "Test Prompt 2",
          "Another test prompt",
          "Test Category 2",
          "Test Industry 2",
          "Test Industry Description 2",
        ],
      ];

      // Create workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(testData);

      // Set column widths
      worksheet["!cols"] = [
        { wch: 8 }, // ID
        { wch: 30 }, // Title
        { wch: 50 }, // Description
        { wch: 20 }, // Category
        { wch: 25 }, // Industry
        { wch: 50 }, // Industry Description
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, "Test Prompts");

      // Generate Excel buffer
      const excelBuffer = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      });

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `test-prompts-${timestamp}.xlsx`;

      // Set headers
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.setHeader("Content-Length", excelBuffer.length);

      // Send buffer
      res.send(excelBuffer);
    } catch (error) {
      console.error("Error in test export:", error);
      res.status(500).json({
        success: false,
        message: "Error creating test Excel file",
        error: error.message,
      });
    }
  }
);

// Test import/export with multiple industries
router.get(
  "/test-industries-export",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { runTask } = require("../utils/worker");

      try {
        const result = await runTask("excel-export.js", {
          action: "export",
          filters: {},
        });

        if (!result.success) {
          return res.status(400).json({
            success: false,
            message: result.error || "Failed to export prompts to Excel",
          });
        }

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `prompts-with-industries-${timestamp}.xlsx`;

        // Set headers for file download
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}`
        );
        res.setHeader("Content-Length", result.data.length);

        // Ensure we send the buffer correctly
        if (Buffer.isBuffer(result.data)) {
          res.send(result.data);
        } else {
          res.send(Buffer.from(result.data));
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Error exporting prompts to Excel",
          error: error.message,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error exporting prompts to Excel",
        error: error.message,
      });
    }
  }
);

// Export prompts to Excel with industry description (enhanced version)
router.get(
  "/export-excel-enhanced",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { runTask } = require("../utils/worker");

      // Get filters from query parameters
      const filters = {
        categoryId: req.query.categoryId || req.query.category_id,
        industryId: req.query.industryId || req.query.industry_id,
        topicId: req.query.topicId || req.query.topic_id,
        subType: req.query.subType || req.query.sub_type,
        isType: req.query.isType || req.query.is_type,
        search: req.query.search,
        limit: req.query.limit,
      };

      // Remove undefined values
      Object.keys(filters).forEach((key) => {
        if (filters[key] === undefined) {
          delete filters[key];
        }
      });

      try {
        const result = await runTask("excel-export.js", {
          action: "export",
          filters: filters,
        });

        if (!result.success) {
          return res.status(400).json({
            success: false,
            message: result.error || "Failed to export prompts to Excel",
          });
        }

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `prompts-enhanced-export-${timestamp}.xlsx`;

        // Set headers for file download
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=${filename}`
        );
        res.setHeader("Content-Length", result.data.length);

        // Ensure we send the buffer correctly
        if (Buffer.isBuffer(result.data)) {
          res.send(result.data);
        } else {
          res.send(Buffer.from(result.data));
        }
      } catch (error) {
        res.status(500).json({
          success: false,
          message: "Error exporting prompts to Excel",
          error: error.message,
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error exporting prompts to Excel",
        error: error.message,
      });
    }
  }
);

// Import Excel file
router.post(
  "/import-excel",
  authMiddleware,
  adminMiddleware,
  uploadExcel.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return sendErrorResponse(
          res,
          "No file uploaded",
          "VALIDATION_ERROR",
          400
        );
      }

      // Kiểm tra file extension
      const allowedExtensions = [".xlsx", ".xls"];
      const fileExtension = path.extname(req.file.originalname).toLowerCase();

      if (!allowedExtensions.includes(fileExtension)) {
        return sendErrorResponse(
          res,
          "Invalid file type. Only Excel files (.xlsx, .xls) are allowed.",
          "VALIDATION_ERROR",
          400
        );
      }

      const { runTask } = require("../utils/worker");

      try {
        // Excel import started

        const result = await runTask("excel-processor.js", {
          filePath: req.file.path,
        });

        // Excel processing completed

        if (!result.success) {
          // Nếu không có record nào được xử lý thành công
          const errorResponse = {
            success: false,
            message:
              result.message ||
              "Import thất bại - không có dữ liệu nào được xử lý",
            count: result.count || 0,
            data: result.data || [],
            insertedRecords: result.insertedRecords || [],
            skippedRecords: result.skippedRecords || [],
            summary: result.summary || {
              totalRows: 0,
              processedRows: 0,
              skippedRows: 0,
              insertedRows: 0,
            },
          };

          return sendErrorResponse(
            res,
            errorResponse.message,
            "VALIDATION_ERROR",
            400
          );
        }

        // Nếu có ít nhất 1 record được xử lý thành công
        const responseData = {
          success: true,
          message:
            result.message ||
            `Excel file imported successfully. ${result.count} records imported.`,
          count: result.count,
          data: result.data,
          insertedRecords: result.insertedRecords || [],
          skippedRecords: result.skippedRecords || [],
          summary: result.summary || {
            totalRows: 0,
            processedRows: result.count,
            skippedRows: 0,
            insertedRows: result.count,
          },
        };

        sendCreateResponse(
          res,
          responseData,
          "Excel file processed successfully"
        );
      } catch (error) {
        sendInternalErrorResponse(
          res,
          "Error processing Excel file: " + error.message
        );
      }
    } catch (error) {
      sendInternalErrorResponse(
        res,
        "Error importing Excel file: " + error.message
      );
    }
  }
);

// Get all prompts with pagination
router.get("/", async (req, res) => {
  try {
    const page = parseInt(req.query.pageIndex || req.query.page) || 1;
    const pageSize =
      parseInt(req.query.limit) || parseInt(req.query.pageSize) || 10;
    const offset = (page - 1) * pageSize;

    const where = {};

    // Handle category filtering - support multiple categoryIds
    if (req.query.categoryIds || req.query.category_id) {
      const categoryIds = req.query.categoryIds || req.query.category_id;
      const categoryArray = Array.isArray(categoryIds)
        ? categoryIds
        : [categoryIds];

      // Convert to numbers and filter out invalid values
      const validCategoryIds = categoryArray
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id) && id > 0);

      if (validCategoryIds.length > 0) {
        where.category_id =
          validCategoryIds.length === 1
            ? validCategoryIds[0]
            : { [Op.in]: validCategoryIds };
      }
    }

    // Handle is_type filtering - support multiple values
    if (req.query.isTypeIds || req.query.isType || req.query.is_type) {
      const isTypes =
        req.query.isTypeIds || req.query.isType || req.query.is_type;
      const isTypeArray = Array.isArray(isTypes) ? isTypes : [isTypes];

      // Convert to numbers and filter out invalid values
      const validIsTypes = isTypeArray
        .map((type) => parseInt(type))
        .filter((type) => !isNaN(type) && type > 0);

      if (validIsTypes.length > 0) {
        where.is_type =
          validIsTypes.length === 1
            ? validIsTypes[0]
            : { [Op.in]: validIsTypes };
      }
    }

    if (
      (!!req.query.subType && Number(req.query.subType) !== 0) ||
      (!!req.query.sub_type && Number(req.query.sub_type) !== 0)
    ) {
      where.sub_type = req.query.subType || req.query.sub_type;
    }

    if (req.query.topicId !== undefined || req.query.topic_id !== undefined) {
      where.topic_id = req.query.topicId || req.query.topic_id;
    }

    // Handle industry filtering - will be added to includeArray later
    let industryFilterIds = null;
    if (req.query.industryIds || req.query.industry_id) {
      const industryIds = req.query.industryIds || req.query.industry_id;
      const industryArray = Array.isArray(industryIds)
        ? industryIds
        : [industryIds];

      // Convert to numbers and filter out invalid values
      const validIndustryIds = industryArray
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id) && id > 0);

      if (validIndustryIds.length > 0) {
        industryFilterIds = validIndustryIds;
      }
    }

    // Handle date filtering - support dateFrom and dateTo
    if (req.query.dateFrom || req.query.dateTo) {
      where.created_at = {};

      if (req.query.dateFrom) {
        const dateFrom = new Date(req.query.dateFrom);
        if (!isNaN(dateFrom.getTime())) {
          // Set to start of day
          dateFrom.setHours(0, 0, 0, 0);
          where.created_at[Op.gte] = dateFrom;
        }
      }

      if (req.query.dateTo) {
        const dateTo = new Date(req.query.dateTo);
        if (!isNaN(dateTo.getTime())) {
          // Set to end of day
          dateTo.setHours(23, 59, 59, 999);
          where.created_at[Op.lte] = dateTo;
        }
      }
    }

    // Handle search - support multiple parameter names
    const searchQuery =
      req.query.search || req.query.searchTerm || req.query.search_text;
    if (searchQuery) {
      const searchTerm = `%${searchQuery}%`;
      where[Op.or] = [
        { title: { [Op.like]: searchTerm } },
        { content: { [Op.like]: searchTerm } },
        { short_description: { [Op.like]: searchTerm } },
        { what: { [Op.like]: searchTerm } },
        { tips: { [Op.like]: searchTerm } },
        { text: { [Op.like]: searchTerm } },
        { how: { [Op.like]: searchTerm } },
        { OptimationGuide: { [Op.like]: searchTerm } },
      ];
    }

    // Handle sorting
    let order = [["created_at", "DESC"]]; // Default sorting
    if (req.query.sortField && req.query.sortOrder) {
      const sortField = req.query.sortField;
      const sortOrder = req.query.sortOrder.toUpperCase();

      // Validate sort order
      if (["ASC", "DESC"].includes(sortOrder)) {
        // Validate sort field to prevent SQL injection
        const allowedSortFields = [
          "id",
          "title",
          "shortDescription",
          "short_description",
          "content",
          "what",
          "tips",
          "text",
          "how",
          "input",
          "output",
          "OptimationGuide",
          "addtip",
          "addinformation",
          "isType",
          "is_type",
          "subType",
          "sub_type",
          "createdAt",
          "created_at",
          "updatedAt",
          "updated_at",
        ];

        if (allowedSortFields.includes(sortField)) {
          // Map camelCase to snake_case for database
          const dbField =
            sortField === "shortDescription"
              ? "short_description"
              : sortField === "isType"
              ? "is_type"
              : sortField === "subType"
              ? "sub_type"
              : sortField === "createdAt"
              ? "created_at"
              : sortField === "updatedAt"
              ? "updated_at"
              : sortField;
          order = [[dbField, sortOrder]];
        }
      }
    }

    // Build include array
    const includeArray = [
      {
        model: Category,
        as: "category",
        attributes: ["id", "name", "image", "image_card", "section_id"],
        include: [
          {
            model: Section,
            as: "section",
            attributes: ["id", "name", "description"],
          },
        ],
      },
      {
        model: Topic,
        as: "topic",
        attributes: ["id", "name"],
      },
      {
        model: Industry,
        as: "promptIndustries",
        attributes: ["id", "name", "description"],
        through: { attributes: [] },
      },
    ];

    // Apply industry filter to promptIndustries if specified
    if (industryFilterIds) {
      includeArray[2] = {
        model: Industry,
        as: "promptIndustries",
        where:
          industryFilterIds.length === 1
            ? { id: industryFilterIds[0] }
            : { id: { [Op.in]: industryFilterIds } },
        attributes: ["id", "name", "description"],
        through: { attributes: [] },
        required: true,
      };
    }

    // Get total count - handle industry filtering separately
    let totalCount;
    if (industryFilterIds) {
      // Need to count with industry join
      const countResult = await Prompt.findAndCountAll({
        where,
        include: [includeArray[2]], // Only include industry for count
        distinct: true,
        col: "id",
      });
      totalCount = countResult.count;
    } else {
      // Simple count without joins
      totalCount = await Prompt.count({ where });
    }

    // Get actual data with includes
    const rows = await Prompt.findAll({
      where,
      include: includeArray,
      limit: pageSize,
      offset: offset,
      order: order,
    });

    const pagination = calculatePagination(totalCount, page, pageSize);
    const transformedRows = transformToCamelCase(rows);
    sendListResponse(res, transformedRows, pagination);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompts", error: error.message });
  }
});

// Get all prompts for user by categoryId with pagination
router.get("/by-category", checkSubTypeAccess, async (req, res) => {
  try {
    const category_id = req.query.categoryId || req.query.category_id;
    if (!category_id) {
      return sendErrorResponse(
        res,
        "categoryId is required",
        "VALIDATION_ERROR",
        400
      );
    }
    const is_type = req.query.isType || req.query.is_type || 1;
    const topic_id = req.query.topicId || req.query.topic_id;
    const searchText = req.query.searchText || req.query.search_text;
    const page = parseInt(req.query.pageIndex || req.query.page) || 1;
    const pageSize =
      parseInt(req.query.limit) || parseInt(req.query.pageSize) || 12;

    const offset = (page - 1) * pageSize;
    let whereCondition = {
      category_id: category_id,
    };

    if (
      (!!req.query.subType && Number(req.query.subType) !== 0) ||
      (!!req.query.sub_type && Number(req.query.sub_type) !== 0)
    ) {
      whereCondition.sub_type = req.query.subType || req.query.sub_type;
    }

    if (
      topic_id &&
      topic_id != 0 &&
      topic_id != "undefined" &&
      topic_id != null
    ) {
      whereCondition.topic_id = topic_id;
    }
    if (searchText) {
      whereCondition[Op.or] = [
        { title: { [Op.like]: `%${searchText}%` } },
        { title: { [Op.like]: `%${searchText.toLowerCase()}%` } },
        { title: { [Op.like]: `%${searchText.toUpperCase()}%` } },
      ];
    }

    // Build include array
    const includeArray = [
      {
        model: Category,
        as: "category",
        attributes: ["id", "name", "image", "image_card"],
        include: [
          {
            model: Section,
            as: "section",
            attributes: ["id", "name", "description"],
          },
        ],
      },
      { model: Topic, as: "topic", attributes: ["id", "name"] },
      {
        model: Industry,
        as: "promptIndustries",
        attributes: ["id", "name", "description"],
        through: { attributes: [] },
      },
    ];

    // Handle industry filter - modify include array after it's defined
    if (req.query.industry_id) {
      const industryIds = Array.isArray(req.query.industry_id)
        ? req.query.industry_id
        : req.query.industry_id.split(",").map((id) => parseInt(id.trim()));

      includeArray[2] = {
        model: Industry,
        as: "promptIndustries",
        where: { id: industryIds },
        attributes: ["id", "name", "description"],
        through: { attributes: [] },
        required: true,
      };
    }

    // Get total count - use same logic as data query for industry filtering
    let countQuery;
    if (req.query.industry_id) {
      countQuery = await Prompt.findAndCountAll({
        where: whereCondition,
        include: [includeArray[2]], // Only include industry filter for count
        distinct: true,
        col: "id",
      });
    } else {
      countQuery = await Prompt.findAndCountAll({
        where: whereCondition,
        distinct: true,
        col: "id",
      });
    }
    const totalCount = countQuery.count;

    // Get actual data with includes
    const rows = await Prompt.findAll({
      where: whereCondition,
      include: includeArray,
      limit: pageSize,
      offset: offset,
    });

    const result = {
      total: totalCount,
      page,
      pageSize,
      data: transformToCamelCase(rows),
    };

    sendDetailResponse(res, transformToCamelCase(result));
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompts", error: error.message });
  }
});

router.get("/topics/by-category", checkSubTypeAccess, async (req, res) => {
  try {
    const category_id = req.query.categoryId || req.query.category_id;
    if (!category_id) {
      return sendErrorResponse(
        res,
        "categoryId is required",
        "VALIDATION_ERROR",
        400
      );
    }

    let whereCondition = {
      category_id,
    };

    if (
      (!!req.query.subType && Number(req.query.subType) !== 0) ||
      (!!req.query.sub_type && Number(req.query.sub_type) !== 0)
    ) {
      whereCondition.sub_type = req.query.subType || req.query.sub_type;
    }

    const prompts = await Prompt.findAll({
      where: whereCondition,
      attributes: ["topic_id"],
      raw: true,
    });

    if (!prompts.length) {
      return res
        .status(404)
        .json({ message: "No topics found for this category" });
    }

    const topicIds = [...new Set(prompts.map((p) => p.topic_id))];
    const topics = await Topic.findAll({
      where: { id: topicIds },
      raw: true,
    });

    const result = {
      categoryId: category_id,
      total: topics.length,
      topics: transformToCamelCase(topics),
    };

    sendDetailResponse(res, transformToCamelCase(result));
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching topics", error: error.message });
  }
});

// lấy list prompts mới nhất
router.get("/newest", checkSubTypeAccess, async (req, res) => {
  try {
    const category_id = req.query.categoryId || req.query.category_id;
    if (!category_id) {
      return sendErrorResponse(
        res,
        "categoryId is required",
        "VALIDATION_ERROR",
        400
      );
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

    let whereCondition = {
      category_id: category_id,
      created_at: {
        [Op.gte]: thirtyDaysAgo,
      },
    };

    if (
      (!!req.query.subType && Number(req.query.subType) !== 0) ||
      (!!req.query.sub_type && Number(req.query.sub_type) !== 0)
    ) {
      whereCondition.sub_type = req.query.subType || req.query.sub_type;
    }

    const newest_prompts = await Prompt.findAll({
      where: whereCondition,
      include: [
        {
          model: Category,
          as: "category",
          attributes: ["id", "name", "image", "image_card"],
          include: [
            {
              model: Section,
              as: "section",
              attributes: ["id", "name", "description"],
            },
            {
              model: Industry,
              as: "industries",
              attributes: ["id", "name", "description"],
              through: { attributes: [] },
            },
          ],
        },
        { model: Topic, as: "topic", attributes: ["id", "name"] },
      ],
      limit: 30,
      order: [["created_at", "DESC"]],
    });

    const result = {
      data: transformToCamelCase(newest_prompts),
    };

    sendDetailResponse(res, transformToCamelCase(result));
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching newest prompts", error: error.message });
  }
});

// Get a single prompt by ID with detailed info
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    let whereCondition = { id };

    const prompt = await Prompt.findOne({
      where: whereCondition,
      include: [
        {
          model: Category,
          as: "category",
          attributes: ["id", "name"],
          include: [
            {
              model: Section,
              as: "section",
              attributes: ["id", "name", "description"],
            },
            {
              model: Industry,
              as: "industries",
              attributes: ["id", "name", "description"],
              through: { attributes: [] },
            },
          ],
        },
        { model: Topic, as: "topic", attributes: ["id", "name"] },
        {
          model: Industry,
          as: "promptIndustries",
          attributes: ["id", "name", "description"],
          through: { attributes: [] },
        },
      ],
    });

    if (!prompt) {
      return res
        .status(404)
        .json({ message: "Prompt not found or you don't have access to it" });
    }

    const relatedPrompts = await Prompt.findAll({
      where: {
        category_id: prompt.category_id,
        sub_type: prompt.sub_type,
        id: { [Op.ne]: id },
      },
      attributes: ["id", "title", "short_description"],
      include: [
        { model: Category, as: "category", attributes: ["id", "name"] },
      ],
      limit: 5,
    });

    const transformedPrompt = transformToCamelCase(prompt);
    sendDetailResponse(res, transformedPrompt);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompt", error: error.message });
  }
});

// Create a new prompt
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  checkSubTypeAccess,
  async (req, res) => {
    try {
      // Validate required fields - support both camelCase and snake_case
      const requiredFields = [
        "title",
        "shortDescription",
        "short_description",
        "categoryId",
        "category_id",
        "topicId",
        "topic_id",
        "content",
      ];

      // Check if at least one form of each required field is present
      const hasShortDescription =
        req.body.shortDescription || req.body.short_description;
      const hasCategoryId = req.body.categoryId || req.body.category_id;
      const hasTopicId = req.body.topicId || req.body.topic_id;

      if (
        !req.body.title ||
        !hasShortDescription ||
        !hasCategoryId ||
        !hasTopicId ||
        !req.body.content
      ) {
        return res.status(400).json({
          message: "Missing required fields",
          required: [
            "title",
            "shortDescription",
            "categoryId",
            "topicId",
            "content",
          ],
        });
      }

      // Normalize field names to snake_case for database
      const categoryId = req.body.categoryId || req.body.category_id;
      const topicId = req.body.topicId || req.body.topic_id;
      const shortDescription =
        req.body.shortDescription || req.body.short_description;

      // Check if category exists
      const category = await Category.findByPk(categoryId);
      if (!category) {
        return res.status(400).json({ message: "Invalid categoryId" });
      }

      // Check if topic exists
      const topic = await Topic.findByPk(topicId);
      if (!topic) {
        return res.status(400).json({ message: "Invalid topicId" });
      }

      // Handle industry_id array - link industries directly to prompt
      let industryIds =
        req.body.industryId ||
        req.body.industry_id ||
        req.body.industry_ids ||
        req.body.industryIds;

      // Convert to array if it's a single value or string
      if (industryIds && !Array.isArray(industryIds)) {
        if (typeof industryIds === "string") {
          // Handle comma-separated string
          industryIds = industryIds
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id);
        } else {
          // Convert single value to array
          industryIds = [industryIds];
        }
      }

      if (industryIds && Array.isArray(industryIds) && industryIds.length > 0) {
        // Convert to numbers and filter out invalid values
        const validIndustryIds = industryIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id) && id > 0);

        if (validIndustryIds.length === 0) {
          return res.status(400).json({
            message: "No valid industry IDs provided",
          });
        }

        // Validate all industry IDs exist
        const industries = await Industry.findAll({
          where: { id: validIndustryIds },
        });

        if (industries.length !== validIndustryIds.length) {
          return res.status(400).json({
            message: "Some industry IDs are invalid",
            provided: validIndustryIds,
            found: industries.map((i) => i.id),
          });
        }

        // Note: We'll create prompt-industry relationships after creating the prompt
        // Store industryIds for later use
        req.industryIds = validIndustryIds;
      }

      // Set default values for optional fields - normalize to snake_case
      const promptData = {
        title: req.body.title,
        short_description: shortDescription,
        category_id: categoryId,
        topic_id: topicId,
        content: req.body.content,
        what: req.body.what || "",
        tips: req.body.tips || "",
        text: req.body.text || "",
        how: req.body.how || "",
        input: req.body.input || "",
        output: req.body.output || "",
        OptimationGuide: req.body.OptimationGuide || "",
        addtip: req.body.addtip || "",
        addinformation: req.body.addinformation || "",
        is_type: req.body.isType || req.body.is_type || 1,
        sub_type: req.body.subType || req.body.sub_type || 1,
      };

      const newPrompt = await Prompt.create(promptData);

      // Create prompt-industry relationships if industryIds were provided
      if (req.industryIds && req.industryIds.length > 0) {
        const promptIndustryData = req.industryIds.map((industryId) => ({
          prompt_id: newPrompt.id,
          industry_id: industryId,
          created_at: new Date(),
        }));

        await PromptIndustry.bulkCreate(promptIndustryData);
      }

      // Fetch the created prompt with related data
      const createdPrompt = await Prompt.findOne({
        where: { id: newPrompt.id },
        include: [
          {
            model: Category,
            as: "category",
            attributes: ["id", "name", "image", "image_card"],
            include: [
              {
                model: Section,
                as: "section",
                attributes: ["id", "name", "description"],
              },
            ],
          },
          { model: Topic, as: "topic", attributes: ["id", "name"] },
          {
            model: Industry,
            as: "promptIndustries",
            attributes: ["id", "name", "description"],
            through: { attributes: [] },
          },
        ],
      });

      res.status(201).json({
        message: "Prompt created successfully",
        prompt: transformToCamelCase(createdPrompt),
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error creating prompt", error: error.message });
    }
  }
);

// Update a prompt
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  checkSubTypeAccess,
  async (req, res) => {
    try {
      const { id } = req.params;
      const prompt = await Prompt.findByPk(id);

      if (!prompt) {
        return res.status(404).json({ message: "Prompt not found" });
      }

      // Validate category and topic if they're being updated
      const categoryId = req.body.categoryId || req.body.category_id;
      const topicId = req.body.topicId || req.body.topic_id;

      if (categoryId) {
        const category = await Category.findByPk(categoryId);
        if (!category) {
          return res.status(400).json({ message: "Invalid categoryId" });
        }
      }

      if (topicId) {
        const topic = await Topic.findByPk(topicId);
        if (!topic) {
          return res.status(400).json({ message: "Invalid topicId" });
        }
      }

      // Handle industry_id array - link industries directly to prompt
      let industryIds =
        req.body.industryId ||
        req.body.industry_id ||
        req.body.industry_ids ||
        req.body.industryIds;

      // Convert to array if it's a single value or string
      if (industryIds && !Array.isArray(industryIds)) {
        if (typeof industryIds === "string") {
          // Handle comma-separated string
          industryIds = industryIds
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id);
        } else {
          // Convert single value to array
          industryIds = [industryIds];
        }
      }

      if (industryIds && Array.isArray(industryIds) && industryIds.length > 0) {
        const promptId = req.params.id;

        // Convert to numbers and filter out invalid values
        const validIndustryIds = industryIds
          .map((id) => parseInt(id))
          .filter((id) => !isNaN(id) && id > 0);

        if (validIndustryIds.length === 0) {
          return res.status(400).json({
            message: "No valid industry IDs provided",
          });
        }

        // Validate all industry IDs exist
        const industries = await Industry.findAll({
          where: { id: validIndustryIds },
        });

        if (industries.length !== validIndustryIds.length) {
          return res.status(400).json({
            message: "Some industry IDs are invalid",
            provided: validIndustryIds,
            found: industries.map((i) => i.id),
          });
        }

        // Remove existing prompt-industry relationships
        await PromptIndustry.destroy({
          where: { prompt_id: promptId },
        });

        // Create new prompt-industry relationships
        const promptIndustryData = validIndustryIds.map((industryId) => ({
          prompt_id: promptId,
          industry_id: industryId,
          created_at: new Date(),
        }));

        await PromptIndustry.bulkCreate(promptIndustryData);
      }

      // Normalize update data to snake_case for database
      const updateData = {};
      if (req.body.title) updateData.title = req.body.title;
      if (req.body.shortDescription || req.body.short_description) {
        updateData.short_description =
          req.body.shortDescription || req.body.short_description;
      }
      if (categoryId) updateData.category_id = categoryId;
      if (topicId) updateData.topic_id = topicId;
      if (req.body.content) updateData.content = req.body.content;
      if (req.body.what) updateData.what = req.body.what;
      if (req.body.tips) updateData.tips = req.body.tips;
      if (req.body.text) updateData.text = req.body.text;
      if (req.body.how) updateData.how = req.body.how;
      if (req.body.input) updateData.input = req.body.input;
      if (req.body.output) updateData.output = req.body.output;
      if (req.body.OptimationGuide)
        updateData.OptimationGuide = req.body.OptimationGuide;
      if (req.body.addtip) updateData.addtip = req.body.addtip;
      if (req.body.addinformation)
        updateData.addinformation = req.body.addinformation;
      if (req.body.isType || req.body.is_type) {
        updateData.is_type = req.body.isType || req.body.is_type;
      }
      if (req.body.subType || req.body.sub_type) {
        updateData.sub_type = req.body.subType || req.body.sub_type;
      }

      await prompt.update(updateData);

      // Fetch the updated prompt with related data
      const updatedPrompt = await Prompt.findOne({
        where: { id },
        include: [
          {
            model: Category,
            as: "category",
            attributes: ["id", "name", "image", "image_card"],
            include: [
              {
                model: Section,
                as: "section",
                attributes: ["id", "name", "description"],
              },
            ],
          },
          { model: Topic, as: "topic", attributes: ["id", "name"] },
          {
            model: Industry,
            as: "promptIndustries",
            attributes: ["id", "name", "description"],
            through: { attributes: [] },
          },
        ],
      });

      res.status(200).json({
        message: "Prompt updated successfully",
        prompt: transformToCamelCase(updatedPrompt),
      });
    } catch (error) {
      res
        .status(500)
        .json({ message: "Error updating prompt", error: error.message });
    }
  }
);

// Delete a prompt
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const prompt = await Prompt.findByPk(id);

    if (!prompt) {
      return res.status(404).json({ message: "Prompt not found" });
    }

    await prompt.destroy();
    res.status(200).json({ message: "Prompt deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error deleting prompt", error: error.message });
  }
});

module.exports = router;
