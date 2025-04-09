const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral'); // Import the Referral model

// Create a new referral
router.post('/', async (req, res) => {
    try {
        const { code, discount, count, status, endDate } = req.body;

        // Validate required fields
        if (!code || !discount) {
            return res.status(400).json({ message: 'Code and discount are required' });
        }

        // Check if the code already exists
        const existingReferral = await Referral.findOne({ where: { code } });
        if (existingReferral) {
            return res.status(400).json({ message: 'Referral code already exists' });
        }

        // Create the referral
        const referral = await Referral.create({
            code,
            discount,
            count: count || 1, // Default to 1 if not provided
            status: status || 1, // Default to 1 if not provided
            endDate: endDate || null,
        });

        return res.status(201).json({ message: 'Referral created successfully', referral });
    } catch (error) {
        console.error('Error creating referral:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all referrals
router.get('/', async (req, res) => {
    try {
        const referrals = await Referral.findAll();
        return res.status(200).json({ referrals });
    } catch (error) {
        console.error('Error fetching referrals:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get a referral by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const referral = await Referral.findByPk(id);

        if (!referral) {
            return res.status(404).json({ message: 'Referral not found' });
        }

        return res.status(200).json({ referral });
    } catch (error) {
        console.error('Error fetching referral:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Update a referral
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { code, discount, count, status, endDate } = req.body;

        const referral = await Referral.findByPk(id);
        if (!referral) {
            return res.status(404).json({ message: 'Referral not found' });
        }

        // Check if the new code already exists (and isn't the current code)
        if (code && code !== referral.code) {
            const existingReferral = await Referral.findOne({ where: { code } });
            if (existingReferral) {
                return res.status(400).json({ message: 'Referral code already exists' });
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

        return res.status(200).json({ message: 'Referral updated successfully', referral });
    } catch (error) {
        console.error('Error updating referral:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Delete a referral
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const referral = await Referral.findByPk(id);

        if (!referral) {
            return res.status(404).json({ message: 'Referral not found' });
        }

        await referral.destroy();
        return res.status(200).json({ message: 'Referral deleted successfully' });
    } catch (error) {
        console.error('Error deleting referral:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Increment the count of a referral
router.patch('/:id/increment-count', async (req, res) => {
    try {
        const { id } = req.params;

        const referral = await Referral.findByPk(id);
        if (!referral) {
            return res.status(404).json({ message: 'Referral not found' });
        }

        // Increment the count
        await referral.increment('count', { by: 1 });

        // Reload the referral to get the updated count
        await referral.reload();

        return res.status(200).json({ message: 'Referral count incremented successfully', referral });
    } catch (error) {
        console.error('Error incrementing referral count:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
});
// Get discount by referral code
router.get('/get-discount/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const referral = await Referral.findOne({ where: { code } });

        if (!referral) {
            return res.status(404).json({ message: 'Referral code not found', success: false });
        }

        if (referral.status !== 1) {
            return res.status(400).json({ message: 'Referral code is not active', success: false });
        }

        if (referral.endDate && new Date(referral.endDate) < new Date()) {
            return res.status(400).json({ message: 'Referral code has expired', success: false });
        }

        // if (referral.count <= 0) {
        //     return res.status(400).json({ message: 'Referral code usage limit reached', success: false });
        // }

        return res.status(200).json({ discount: referral.discount, success: true });
    } catch (error) {
        console.error('Error fetching discount:', error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
});
module.exports = router;