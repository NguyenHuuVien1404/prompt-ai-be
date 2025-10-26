/**
 * VNPay Logging and Monitoring Utility
 * Utility để log và monitor các giao dịch VNPay
 */

const fs = require("fs");
const path = require("path");
const moment = require("moment");

class VNPayLogger {
  constructor() {
    this.logDir = path.join(__dirname, "../logs/vnpay");
    this.ensureLogDirectory();
  }

  /**
   * Tạo thư mục log nếu chưa tồn tại
   */
  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Ghi log với timestamp
   * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
   * @param {string} message - Log message
   * @param {Object} data - Additional data to log
   */
  log(level, message, data = {}) {
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
    const logEntry = {
      timestamp,
      level,
      message,
      data,
      pid: process.pid,
    };

    // Console log
    console.log(`[${timestamp}] [${level}] ${message}`, data);

    // File log
    this.writeToFile(logEntry);
  }

  /**
   * Ghi log vào file
   * @param {Object} logEntry - Log entry object
   */
  writeToFile(logEntry) {
    try {
      const date = moment().format("YYYY-MM-DD");
      const logFile = path.join(this.logDir, `vnpay-${date}.log`);
      const logLine = JSON.stringify(logEntry) + "\n";

      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.error("Error writing to log file:", error);
    }
  }

  /**
   * Log payment URL creation
   * @param {Object} params - Payment parameters
   * @param {string} orderId - Order ID
   * @param {string} paymentUrl - Generated payment URL
   */
  logPaymentUrlCreation(params, orderId, paymentUrl) {
    this.log("INFO", "Payment URL created", {
      orderId,
      userId: params.userId,
      subscriptionId: params.subscriptionId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      couponId: params.couponId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  /**
   * Log IPN request
   * @param {Object} params - IPN parameters
   * @param {string} orderId - Order ID
   * @param {string} responseCode - VNPay response code
   */
  logIPNRequest(params, orderId, responseCode) {
    this.log("INFO", "VNPay IPN received", {
      orderId,
      responseCode,
      transactionNo: params.vnp_TransactionNo,
      amount: params.vnp_Amount,
      payDate: params.vnp_PayDate,
      bankCode: params.vnp_BankCode,
      ipAddress: params.vnp_IpAddr,
    });
  }

  /**
   * Log payment processing result
   * @param {string} orderId - Order ID
   * @param {string} status - Payment status
   * @param {Object} result - Processing result
   */
  logPaymentResult(orderId, status, result) {
    this.log("INFO", "Payment processed", {
      orderId,
      status,
      result: {
        userId: result.userId,
        subscriptionId: result.subscriptionId,
        amount: result.amount,
        transactionId: result.transactionId,
        subscriptionName: result.subscriptionName,
      },
    });
  }

  /**
   * Log error
   * @param {string} operation - Operation that failed
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  logError(operation, error, context = {}) {
    this.log("ERROR", `VNPay ${operation} failed`, {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      context,
    });
  }

  /**
   * Log security event
   * @param {string} event - Security event type
   * @param {Object} details - Event details
   */
  logSecurityEvent(event, details) {
    this.log("WARN", `Security event: ${event}`, details);
  }

  /**
   * Log query transaction
   * @param {string} orderId - Order ID
   * @param {string} transDate - Transaction date
   * @param {Object} result - Query result
   */
  logQueryTransaction(orderId, transDate, result) {
    this.log("INFO", "Transaction queried", {
      orderId,
      transDate,
      result: {
        responseCode: result.RspCode,
        message: result.Message,
        transactionStatus: result.TransactionStatus,
      },
    });
  }

  /**
   * Log refund request
   * @param {string} orderId - Order ID
   * @param {number} amount - Refund amount
   * @param {string} user - User who initiated refund
   * @param {Object} result - Refund result
   */
  logRefundRequest(orderId, amount, user, result) {
    this.log("INFO", "Refund processed", {
      orderId,
      amount,
      user,
      result: {
        responseCode: result.RspCode,
        message: result.Message,
        transactionId: result.TransactionId,
      },
    });
  }

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  logPerformance(operation, duration, metadata = {}) {
    this.log("DEBUG", `Performance: ${operation}`, {
      duration: `${duration}ms`,
      metadata,
    });
  }

  /**
   * Get log statistics for a date range
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Object} Log statistics
   */
  getLogStatistics(startDate, endDate) {
    const stats = {
      totalLogs: 0,
      byLevel: {},
      byOperation: {},
      errors: 0,
      warnings: 0,
      successfulPayments: 0,
      failedPayments: 0,
    };

    try {
      const start = moment(startDate);
      const end = moment(endDate);

      for (let date = start; date.isSameOrBefore(end); date.add(1, "day")) {
        const logFile = path.join(
          this.logDir,
          `vnpay-${date.format("YYYY-MM-DD")}.log`
        );

        if (fs.existsSync(logFile)) {
          const logs = fs
            .readFileSync(logFile, "utf8")
            .split("\n")
            .filter((line) => line.trim())
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch (e) {
                return null;
              }
            })
            .filter((log) => log !== null);

          logs.forEach((log) => {
            stats.totalLogs++;

            // Count by level
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;

            // Count errors and warnings
            if (log.level === "ERROR") stats.errors++;
            if (log.level === "WARN") stats.warnings++;

            // Count operations
            if (log.message.includes("Payment processed")) {
              if (log.data.status === "SUCCESS") {
                stats.successfulPayments++;
              } else {
                stats.failedPayments++;
              }
            }
          });
        }
      }
    } catch (error) {
      console.error("Error getting log statistics:", error);
    }

    return stats;
  }

  /**
   * Clean old log files
   * @param {number} daysToKeep - Number of days to keep logs
   */
  cleanOldLogs(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(this.logDir);
      const cutoffDate = moment().subtract(daysToKeep, "days");

      files.forEach((file) => {
        if (file.startsWith("vnpay-") && file.endsWith(".log")) {
          const dateStr = file.replace("vnpay-", "").replace(".log", "");
          const fileDate = moment(dateStr, "YYYY-MM-DD");

          if (fileDate.isBefore(cutoffDate)) {
            const filePath = path.join(this.logDir, file);
            fs.unlinkSync(filePath);
            console.log(`Deleted old log file: ${file}`);
          }
        }
      });
    } catch (error) {
      console.error("Error cleaning old logs:", error);
    }
  }
}

// Create singleton instance
const vnpayLogger = new VNPayLogger();

module.exports = vnpayLogger;
