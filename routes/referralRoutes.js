const express = require("express");
const router = express.Router();
const Referral = require("../models/Referral"); // Import the Referral model
const cache = require("../utils/cache"); // Import cache utility
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

// Create a new referral
router.post("/", async (req, res) => {
  try {
    const { code, discount, count, status, endDate } = req.body;

    // Validate required fields
    if (!code || !discount) {
      return sendErrorResponse(
        res,
        "Code and discount are required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Check if the code already exists
    const existingReferral = await Referral.findOne({ where: { code } });
    if (existingReferral) {
      return sendErrorResponse(
        res,
        "Referral code already exists",
        "DUPLICATE_CODE",
        400
      );
    }

    // Create the referral
    const referral = await Referral.create({
      code,
      discount,
      count: count || 1, // Default to 1 if not provided
      status: status || 1, // Default to 1 if not provided
      endDate: endDate || null,
    });

    // Invalidate cache when creating a new referral
    await cache.invalidateCache("all_referrals");

    sendCreateResponse(res, referral, "Referral created successfully");
  } catch (error) {
    sendInternalErrorResponse(res, "Error creating referral: " + error.message);
  }
});

// Get all referrals
router.get("/", async (req, res) => {
  try {
    // Try to get data from cache first
    const cachedReferrals = await cache.getCache("all_referrals");

    if (cachedReferrals) {
      const referrals = JSON.parse(cachedReferrals);
      const pagination = calculatePagination(
        referrals.length,
        1,
        referrals.length
      );
      return sendListResponse(res, referrals, pagination);
    }

    // If not in cache, fetch from database
    const referrals = await Referral.findAll();

    // Store in cache for 10 minutes (600 seconds)
    await cache.setCache("all_referrals", JSON.stringify(referrals), 600);

    const pagination = calculatePagination(
      referrals.length,
      1,
      referrals.length
    );
    return sendListResponse(res, referrals, pagination);
  } catch (error) {
    sendInternalErrorResponse(
      res,
      "Error fetching referrals: " + error.message
    );
  }
});

// Get a referral by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Try to get from cache
    const cachedReferral = await cache.getCache(`referral_${id}`);

    if (cachedReferral) {
      const referral = JSON.parse(cachedReferral);
      const responseData = {
        ...referral,
        source: "cache",
      };
      return sendDetailResponse(res, responseData);
    }

    const referral = await Referral.findByPk(id);

    if (!referral) {
      return sendNotFoundResponse(res, "Referral not found");
    }

    // Store in cache for 10 minutes
    await cache.setCache(`referral_${id}`, JSON.stringify(referral), 600);

    const responseData = {
      ...referral.toJSON(),
      source: "database",
    };
    return sendDetailResponse(res, responseData);
  } catch (error) {
    sendInternalErrorResponse(res, "Error fetching referral: " + error.message);
  }
});

// Update a referral
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { code, discount, count, status, endDate } = req.body;

    const referral = await Referral.findByPk(id);
    if (!referral) {
      return sendNotFoundResponse(res, "Referral not found");
    }

    // Check if the new code already exists (and isn't the current code)
    if (code && code !== referral.code) {
      const existingReferral = await Referral.findOne({ where: { code } });
      if (existingReferral) {
        return sendErrorResponse(
          res,
          "Referral code already exists",
          "DUPLICATE_CODE",
          400
        );
      }
    }

    // Update the referral
    await referral.update({
      code: code || referral.code,
      discount: discount || referral.discount,
      count: count || referral.count,
      status: status || referral.status,
      endDate: endDate || referral.endDate,
    });

    // Invalidate related caches
    await Promise.all([
      cache.invalidateCache(`referral_${id}`),
      cache.invalidateCache("all_referrals"),
    ]);

    return res
      .status(200)
      .json({ message: "Referral updated successfully", referral });
  } catch (error) {
    sendInternalErrorResponse(res, "Server error: " + error.message);
  }
});

// Delete a referral
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const referral = await Referral.findByPk(id);

    if (!referral) {
      return sendNotFoundResponse(res, "Referral not found");
    }

    await referral.destroy();

    // Invalidate related caches
    await Promise.all([
      cache.invalidateCache(`referral_${id}`),
      cache.invalidateCache("all_referrals"),
    ]);

    sendDeleteResponse(res, "Referral deleted successfully");
  } catch (error) {
    sendInternalErrorResponse(res, "Server error: " + error.message);
  }
});

// Increment the count of a referral
router.patch("/:id/increment-count", async (req, res) => {
  try {
    const { id } = req.params;

    const referral = await Referral.findByPk(id);
    if (!referral) {
      return sendNotFoundResponse(res, "Referral not found");
    }

    // Increment the count
    await referral.increment("count", { by: 1 });

    // Reload the referral to get the updated count
    await referral.reload();

    // Invalidate related caches
    await Promise.all([
      cache.invalidateCache(`referral_${id}`),
      cache.invalidateCache("all_referrals"),
    ]);

    return res
      .status(200)
      .json({ message: "Referral count incremented successfully", referral });
  } catch (error) {
    sendInternalErrorResponse(res, "Server error: " + error.message);
  }
});

// Get discount by referral code
router.get("/get-discount/:code", async (req, res) => {
  try {
    const { code } = req.params;

    // Try to get from cache
    const cachedDiscount = await cache.getCache(`discount_${code}`);

    if (cachedDiscount) {
      sendDetailResponse(res, JSON.parse(cachedDiscount));
    }

    const referral = await Referral.findOne({ where: { code } });

    if (!referral) {
      return res
        .status(404)
        .json({ message: "Referral code not found", success: false });
    }

    if (referral.status !== 1) {
      return res
        .status(400)
        .json({ message: "Referral code is not active", success: false });
    }

    if (referral.endDate && new Date(referral.endDate) < new Date()) {
      return res
        .status(400)
        .json({ message: "Referral code has expired", success: false });
    }

    // if (referral.count <= 0) {
    //     return res.status(400).json({ message: 'Referral code usage limit reached', success: false });
    // }

    const response = { discount: referral.discount, success: true };

    // Cache discount for 5 minutes (300 seconds)
    await cache.setCache(`discount_${code}`, JSON.stringify(response), 300);

    sendDetailResponse(res, response);
  } catch (error) {
    sendInternalErrorResponse(res, "Server error: " + error.message);
  }
});

module.exports = router;
