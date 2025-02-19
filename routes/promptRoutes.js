// routes/promptRoutes.js
const express = require('express');
const router = express.Router();
const Prompt = require('../models/Prompt');
const Category = require('../models/Category');

// Get all prompts with pagination
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const offset = (page - 1) * pageSize;

        const { count, rows } = await Prompt.findAndCountAll({
            include: [{ model: Category, attributes: ['id', 'name'] }],
            limit: pageSize,
            offset: offset,
            order: [['created_at', 'DESC']]
        });

        res.status(200).json({
            total: count,
            page,
            pageSize,
            data: rows
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching prompts', error: error.message });
    }
});

// Get prompt by id
router.get('/:id', async (req, res) => {
    try {
        const promptId = req.params.id;
        const prompt = await Prompt.findByPk(promptId, {
            include: [{ model: Category, attributes: ['id', 'name'] }]
        });

        if (!prompt) {
            return res.status(404).json({ message: 'Prompt not found' });
        }

        // Increment views
        await prompt.update({ views: prompt.views + 1 });

        res.status(200).json(prompt);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching prompt', error: error.message });
    }
});

// Create new prompt
router.post('/', async (req, res) => {
    try {
        const { title, content, short_description, category_id, is_type, status } = req.body;

        // Validate request
        if (!title || !content || !short_description) {
            return res.status(400).json({ message: 'Title, content, and short description are required' });
        }

        const newPrompt = await Prompt.create({
            title,
            content,
            short_description,
            category_id,
            is_type: is_type || 1,
            status: status || 1
        });

        res.status(201).json(newPrompt);
    } catch (error) {
        res.status(500).json({ message: 'Error creating prompt', error: error.message });
    }
});

// Update prompt
router.put('/:id', async (req, res) => {
    try {
        const promptId = req.params.id;
        const { title, content, short_description, category_id, is_type, status } = req.body;

        const prompt = await Prompt.findByPk(promptId);
        if (!prompt) {
            return res.status(404).json({ message: 'Prompt not found' });
        }

        await prompt.update({
            title: title || prompt.title,
            content: content || prompt.content,
            short_description: short_description || prompt.short_description,
            category_id: category_id || prompt.category_id,
            is_type: is_type !== undefined ? is_type : prompt.is_type,
            status: status !== undefined ? status : prompt.status
        });

        res.status(200).json(prompt);
    } catch (error) {
        res.status(500).json({ message: 'Error updating prompt', error: error.message });
    }
});

// Delete prompt
router.delete('/:id', async (req, res) => {
    try {
        const promptId = req.params.id;
        const prompt = await Prompt.findByPk(promptId);

        if (!prompt) {
            return res.status(404).json({ message: 'Prompt not found' });
        }

        await prompt.destroy();
        res.status(200).json({ message: 'Prompt deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting prompt', error: error.message });
    }
});

module.exports = router;