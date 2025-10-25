const express = require("express");
const router = express.Router();
const User = require("../models/User");
const UserSub = require("../models/UserSub");
const Subscription = require("../models/Subscription");
const bcrypt = require("bcryptjs");
const {
  sendCreateResponse,
  sendUpdateResponse,
  sendErrorResponse,
  sendInternalErrorResponse,
} = require("../utils/responseUtils");
const { transformToCamelCase } = require("../utils/transformUtils");

/**
 * @route POST /api/zapier/member-added
 * @desc Webhook endpoint to receive member data from Zapier/Skool
 * @desc Automatically creates PREMIUM subscription (type=2) with duration=1000 for new members
 * @access Public (but should be secured with a secret token in production)
 */
router.post("/member-added", async (req, res) => {
  try {
    console.log("📩 Data received from Zapier:", req.body);

    // Validate required fields (3 main fields: name, email, joined_at)
    const { email, name, joined_at } = req.body;

    if (!email) {
      return sendErrorResponse(
        res,
        "Email is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return sendErrorResponse(
        res,
        "Invalid email format",
        "VALIDATION_ERROR",
        400
      );
    }

    // Use name field as primary, fallback to email prefix
    const userFullName = name || email.split("@")[0];

    // Parse joined_at date
    let joinedAtDate = null;
    if (joined_at) {
      joinedAtDate = new Date(joined_at);
      if (isNaN(joinedAtDate.getTime())) {
        return sendErrorResponse(
          res,
          "Invalid joined_at date format",
          "VALIDATION_ERROR",
          400
        );
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });

    if (existingUser) {
      // Update existing user
      const updateData = {
        full_name: userFullName,
        account_status: 1, // Activate account
      };

      // Update additional fields if provided
      if (req.body.profileImage || req.body.profile_image) {
        updateData.profile_image =
          req.body.profileImage || req.body.profile_image;
      }

      if (req.body.googleId || req.body.google_id) {
        updateData.google_id = req.body.googleId || req.body.google_id;
      }

      // Update user
      await existingUser.update(updateData);

      // Check if user has any active subscription
      const existingUserSub = await UserSub.findOne({
        where: { user_id: existingUser.id, status: 1 },
      });

      // If no active subscription, create PREMIUM subscription
      if (!existingUserSub) {
        const premiumSub = await Subscription.findOne({
          where: { type: 2 },
          attributes: ["id", "name_sub", "type", "duration"],
        });

        if (premiumSub) {
          const startDate = joinedAtDate || new Date();
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + premiumSub.duration);

          await UserSub.create({
            user_id: existingUser.id,
            sub_id: premiumSub.id,
            status: 1,
            start_date: startDate,
            end_date: endDate,
            token: premiumSub.duration || 0, // Token count from subscription
          });

          // Update user count_promt based on subscription duration
          await existingUser.update({
            count_promt: premiumSub.duration,
          });

          console.log(
            `✅ Created PREMIUM subscription for existing user: ${email} (token: ${premiumSub.duration})`
          );
        }
      }

      // Fetch updated user with relations
      const updatedUser = await User.findOne({
        where: { email },
        attributes: { exclude: ["password_hash", "otp_code"] },
      });

      return sendUpdateResponse(
        res,
        {
          message: "User updated successfully",
          user: transformToCamelCase(updatedUser),
          action: "update",
        },
        "User updated from Zapier webhook"
      );
    } else {
      // Find PREMIUM subscription (type = 2) BEFORE creating user
      const premiumSub = await Subscription.findOne({
        where: { type: 2 },
        attributes: ["id", "name_sub", "type", "duration"],
      });

      // Create new user
      const newUserData = {
        email,
        full_name: userFullName,
        account_status: 1,
        role: 1, // Default role: User
        is_verified: true, // Auto-verify users from Zapier
        count_promt: premiumSub?.duration || 0, // Get token count from subscription
      };

      // Set created_at to joined_at if provided
      if (joinedAtDate) {
        newUserData.created_at = joinedAtDate;
        newUserData.updated_at = joinedAtDate;
      }

      // Add optional fields if provided
      if (req.body.profileImage || req.body.profile_image) {
        newUserData.profile_image =
          req.body.profileImage || req.body.profile_image;
      }

      if (req.body.googleId || req.body.google_id) {
        newUserData.google_id = req.body.googleId || req.body.google_id;
      }

      // Generate a random password for Zapier users
      if (req.body.password) {
        newUserData.password_hash = await bcrypt.hash(req.body.password, 10);
      } else {
        // Generate random password if not provided
        const randomPassword = Math.random().toString(36).slice(-8);
        newUserData.password_hash = await bcrypt.hash(randomPassword, 10);
      }

      // Create new user
      const newUser = await User.create(newUserData);

      if (premiumSub) {
        // Calculate end date based on duration (1000 days)
        const startDate = joinedAtDate || new Date();
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + premiumSub.duration);

        // Create UserSub for new user with token from subscription
        await UserSub.create({
          user_id: newUser.id,
          sub_id: premiumSub.id,
          status: 1, // Active
          start_date: startDate,
          end_date: endDate,
          token: premiumSub.duration || 0, // Token count from subscription
        });

        console.log(
          `✅ Created PREMIUM subscription for user: ${email} (token: ${
            premiumSub.duration
          }, end: ${endDate.toISOString()})`
        );
      } else {
        console.warn("⚠️ PREMIUM subscription (type=2) not found in database");
      }

      // Fetch created user without sensitive data
      const createdUser = await User.findOne({
        where: { email },
        attributes: { exclude: ["password_hash", "otp_code"] },
      });

      return sendCreateResponse(
        res,
        {
          message: "User created successfully",
          user: transformToCamelCase(createdUser),
          action: "create",
        },
        "User created from Zapier webhook"
      );
    }
  } catch (error) {
    console.error("❌ Error processing Zapier webhook:", error);

    // Handle duplicate email error
    if (error.name === "SequelizeUniqueConstraintError") {
      return sendErrorResponse(
        res,
        "User with this email already exists",
        "DUPLICATE_ERROR",
        409
      );
    }

    return sendInternalErrorResponse(
      res,
      "Error processing Zapier webhook: " + error.message
    );
  }
});

/**
 * @route POST /api/zapier/member-updated
 * @desc Webhook endpoint to update member data from Zapier/Skool
 * @access Public (but should be secured with a secret token in production)
 */
router.post("/member-updated", async (req, res) => {
  try {
    console.log("📩 Update data received from Zapier:", req.body);

    const { email } = req.body;

    if (!email) {
      return sendErrorResponse(
        res,
        "Email is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Find user by email
    const existingUser = await User.findOne({ where: { email } });

    if (!existingUser) {
      return sendErrorResponse(res, "User not found", "NOT_FOUND", 404);
    }

    // Build update data
    const updateData = {};

    if (req.body.fullName || req.body.full_name) {
      updateData.full_name = req.body.fullName || req.body.full_name;
    }

    if (req.body.profileImage || req.body.profile_image) {
      updateData.profile_image =
        req.body.profileImage || req.body.profile_image;
    }

    if (
      req.body.accountStatus !== undefined ||
      req.body.account_status !== undefined
    ) {
      updateData.account_status =
        req.body.accountStatus || req.body.account_status;
    }

    if (req.body.role !== undefined) {
      updateData.role = req.body.role;
    }

    // Update user
    await existingUser.update(updateData);

    // Fetch updated user
    const updatedUser = await User.findOne({
      where: { email },
      attributes: { exclude: ["password_hash", "otp_code"] },
    });

    return sendUpdateResponse(
      res,
      {
        message: "User updated successfully",
        user: transformToCamelCase(updatedUser),
      },
      "User updated from Zapier webhook"
    );
  } catch (error) {
    console.error("❌ Error updating user from Zapier:", error);
    return sendInternalErrorResponse(
      res,
      "Error updating user: " + error.message
    );
  }
});

/**
 * @route POST /api/zapier/member-removed
 * @desc Webhook endpoint to deactivate/remove member from Zapier/Skool
 * @access Public (but should be secured with a secret token in production)
 */
router.post("/member-removed", async (req, res) => {
  try {
    console.log("📩 Remove member data received from Zapier:", req.body);

    const { email } = req.body;

    if (!email) {
      return sendErrorResponse(
        res,
        "Email is required",
        "VALIDATION_ERROR",
        400
      );
    }

    // Find user by email
    const existingUser = await User.findOne({ where: { email } });

    if (!existingUser) {
      return sendErrorResponse(res, "User not found", "NOT_FOUND", 404);
    }

    // Deactivate account instead of deleting
    await existingUser.update({
      account_status: 0, // Deactivate
    });

    return sendUpdateResponse(
      res,
      {
        message: "User deactivated successfully",
        email: email,
      },
      "User deactivated from Zapier webhook"
    );
  } catch (error) {
    console.error("❌ Error removing user from Zapier:", error);
    return sendInternalErrorResponse(
      res,
      "Error removing user: " + error.message
    );
  }
});

module.exports = router;
