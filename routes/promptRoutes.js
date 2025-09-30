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

      // Get filters from query parameters
      const filters = {
        categoryId: req.query.category_id,
        industryId: req.query.industry_id,
        topicId: req.query.topic_id,
        subType: req.query.sub_type,
        isType: req.query.is_type,
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
        categoryId: req.query.category_id,
        industryId: req.query.industry_id,
        topicId: req.query.topic_id,
        subType: req.query.sub_type,
        isType: req.query.is_type,
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
router.get("/", authMiddleware, checkSubTypeAccess, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
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

    if (!!req.query.sub_type && Number(req.query.sub_type) !== 0) {
      where.sub_type = req.query.sub_type;
    }

    if (req.query.topic_id !== undefined) {
      where.topic_id = req.query.topic_id;
    }

    // Handle industry filtering - support multiple industryIds
    let industryFilter = null;
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
        industryFilter = {
          model: Category,
          attributes: ["id", "name", "image", "image_card", "section_id"],
          include: [
            {
              model: Section,
              attributes: ["id", "name", "description"],
            },
            {
              model: Industry,
              as: "industries",
              where:
                validIndustryIds.length === 1
                  ? { id: validIndustryIds[0] }
                  : { id: { [Op.in]: validIndustryIds } },
              attributes: ["id", "name", "description"],
              through: { attributes: [] },
            },
          ],
          required: true,
        };
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

    if (req.query.search) {
      const searchTerm = `%${req.query.search}%`;
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
          "is_type",
          "sub_type",
          "created_at",
          "updated_at",
        ];

        if (allowedSortFields.includes(sortField)) {
          order = [[sortField, sortOrder]];
        }
      }
    }

    // Build include array
    const includeArray = [
      {
        model: Category,
        attributes: ["id", "name", "image", "image_card", "section_id"],
        include: [
          {
            model: Section,
            attributes: ["id", "name", "description"],
          },
          {
            model: Industry,
            as: "industries",
            attributes: ["id", "name", "description"],
            through: { attributes: [] }, // Exclude join table attributes
          },
        ],
      },
      {
        model: Topic,
        as: "topic",
        attributes: ["id", "name"],
      },
    ];

    // Add industry filter if specified
    if (industryFilter) {
      includeArray[0] = industryFilter;
    }

    const { count, rows } = await Prompt.findAndCountAll({
      where,
      include: includeArray,
      limit: pageSize,
      offset: offset,
      order: order,
    });

    const pagination = calculatePagination(count, page, pageSize);
    sendListResponse(res, rows, pagination);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompts", error: error.message });
  }
});

// Get all prompts for user by categoryId with pagination
router.get("/by-category", checkSubTypeAccess, async (req, res) => {
  try {
    const category_id = req.query.category_id;
    if (!category_id) {
      return sendErrorResponse(
        res,
        "category_id is required",
        "VALIDATION_ERROR",
        400
      );
    }
    const is_type = req.query.is_type || 1;
    const topic_id = req.query.topic_id;
    const searchText = req.query.search_text;
    const page = parseInt(req.query.page) || 1;
    const pageSize =
      parseInt(req.query.limit) || parseInt(req.query.pageSize) || 12;

    const offset = (page - 1) * pageSize;
    let whereCondition = {
      category_id: category_id,
    };

    if (!!req.query.sub_type && Number(req.query.sub_type) !== 0) {
      whereCondition.sub_type = req.query.sub_type;
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

    const { count, rows } = await Prompt.findAndCountAll({
      where: whereCondition,
      include: [
        {
          model: Category,
          attributes: ["id", "name", "image", "image_card"],
          include: [
            {
              model: Section,
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
      limit: pageSize,
      offset: offset,
    });

    const result = {
      total: count,
      page,
      pageSize,
      data: rows,
    };

    sendDetailResponse(res, result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching prompts", error: error.message });
  }
});

router.get("/topics/by-category", checkSubTypeAccess, async (req, res) => {
  try {
    const { category_id } = req.query;
    if (!category_id) {
      return sendErrorResponse(
        res,
        "category_id is required",
        "VALIDATION_ERROR",
        400
      );
    }

    let whereCondition = {
      category_id,
    };

    if (!!req.query.sub_type && Number(req.query.sub_type) !== 0) {
      whereCondition.sub_type = req.query.sub_type;
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
      category_id,
      total: topics.length,
      topics,
    };

    sendDetailResponse(res, result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching topics", error: error.message });
  }
});

// lấy list prompts mới nhất
router.get("/newest", checkSubTypeAccess, async (req, res) => {
  try {
    const category_id = req.query.category_id;
    if (!category_id) {
      return sendErrorResponse(
        res,
        "category_id is required",
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

    if (!!req.query.sub_type && Number(req.query.sub_type) !== 0) {
      whereCondition.sub_type = req.query.sub_type;
    }

    const newest_prompts = await Prompt.findAll({
      where: whereCondition,
      include: [
        {
          model: Category,
          attributes: ["id", "name", "image", "image_card"],
          include: [
            {
              model: Section,
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
      data: newest_prompts,
    };

    sendDetailResponse(res, result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching newest prompts", error: error.message });
  }
});

// Get a single prompt by ID with detailed info
router.get("/:id", authMiddleware, checkSubTypeAccess, async (req, res) => {
  try {
    const { id } = req.params;

    let whereCondition = { id };

    const prompt = await Prompt.findOne({
      where: whereCondition,
      include: [
        {
          model: Category,
          attributes: ["id", "name"],
          include: [
            {
              model: Section,
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
      include: [{ model: Category, attributes: ["id", "name"] }],
      limit: 5,
    });

    sendDetailResponse(res, prompt);
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
      // Validate required fields
      const requiredFields = [
        "title",
        "short_description",
        "category_id",
        "topic_id",
        "content",
      ];
      for (const field of requiredFields) {
        if (!req.body[field]) {
          return res.status(400).json({
            message: `Missing required field: ${field}`,
            required: requiredFields,
          });
        }
      }

      // Check if category exists
      const category = await Category.findByPk(req.body.category_id);
      if (!category) {
        return res.status(400).json({ message: "Invalid category_id" });
      }

      // Check if topic exists
      const topic = await Topic.findByPk(req.body.topic_id);
      if (!topic) {
        return res.status(400).json({ message: "Invalid topic_id" });
      }

      // Handle industry_id array - link industries to category
      if (req.body.industry_id && Array.isArray(req.body.industry_id)) {
        const industryIds = req.body.industry_id;

        // Validate all industry IDs exist
        const industries = await Industry.findAll({
          where: { id: industryIds },
        });

        if (industries.length !== industryIds.length) {
          return res.status(400).json({
            message: "Some industry IDs are invalid",
          });
        }

        // Create category-industry relationships
        const categoryIndustryData = industryIds.map((industryId) => ({
          category_id: req.body.category_id,
          industry_id: industryId,
          created_at: new Date(),
        }));

        await CategoryIndustry.bulkCreate(categoryIndustryData);
      }

      // Set default values for optional fields
      const promptData = {
        ...req.body,
        what: req.body.what || "",
        tips: req.body.tips || "",
        text: req.body.text || "",
        how: req.body.how || "",
        input: req.body.input || "",
        output: req.body.output || "",
        OptimationGuide: req.body.OptimationGuide || "",
        addtip: req.body.addtip || "",
        addinformation: req.body.addinformation || "",
        is_type: req.body.is_type || 1,
        sub_type: req.body.sub_type || 1,
      };

      // Remove industry_id from prompt data as it's not a field in Prompt table
      delete promptData.industry_id;

      const newPrompt = await Prompt.create(promptData);

      // Fetch the created prompt with related data
      const createdPrompt = await Prompt.findOne({
        where: { id: newPrompt.id },
        include: [
          {
            model: Category,
            attributes: ["id", "name", "image", "image_card"],
            include: [
              {
                model: Section,
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
      });

      res.status(201).json({
        message: "Prompt created successfully",
        prompt: createdPrompt,
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
      if (req.body.category_id) {
        const category = await Category.findByPk(req.body.category_id);
        if (!category) {
          return res.status(400).json({ message: "Invalid category_id" });
        }
      }

      if (req.body.topic_id) {
        const topic = await Topic.findByPk(req.body.topic_id);
        if (!topic) {
          return res.status(400).json({ message: "Invalid topic_id" });
        }
      }

      // Handle industry_id array - link industries to category
      if (req.body.industry_id && Array.isArray(req.body.industry_id)) {
        const industryIds = req.body.industry_id;
        const categoryId = req.body.category_id || prompt.category_id;

        if (categoryId) {
          // Validate all industry IDs exist
          const industries = await Industry.findAll({
            where: { id: industryIds },
          });

          if (industries.length !== industryIds.length) {
            return res.status(400).json({
              message: "Some industry IDs are invalid",
            });
          }

          // Remove existing category-industry relationships
          await CategoryIndustry.destroy({
            where: { category_id: categoryId },
          });

          // Create new category-industry relationships
          const categoryIndustryData = industryIds.map((industryId) => ({
            category_id: categoryId,
            industry_id: industryId,
            created_at: new Date(),
          }));

          await CategoryIndustry.bulkCreate(categoryIndustryData);
        }
      }

      // Remove industry_id from update data as it's not a field in Prompt table
      const updateData = { ...req.body };
      delete updateData.industry_id;

      await prompt.update(updateData);

      // Fetch the updated prompt with related data
      const updatedPrompt = await Prompt.findOne({
        where: { id },
        include: [
          {
            model: Category,
            attributes: ["id", "name", "image", "image_card"],
            include: [
              {
                model: Section,
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
      });

      res.status(200).json({
        message: "Prompt updated successfully",
        prompt: updatedPrompt,
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
