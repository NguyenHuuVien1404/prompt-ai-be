const { parentPort, workerData } = require('worker_threads');
const XLSX = require('xlsx');
const sequelize = require('../config/database');
const { Prompt, Category, Topic } = require('../models');

// Function to process Excel file
async function processExcelFile(filePath) {
    try {
        // Read the Excel file
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const headers = jsonData[0];
        const rows = jsonData.slice(1);

        // Format content function
        const formatContent = (text, header) => {
            if (!text) return '';
            if (header === 'category' || header === 'topic' || header === 'title') {
                return text.trim();
            }
            if (text.includes('●')) {
                const items = text.split('●').filter(item => item.trim()).map(item => `<p>${item.trim()}</p>`);
                return items.join('');
            }
            return `<p>${text.trim()}</p>`;
        };

        // Prepare data
        const prompts = [];
        const transaction = await sequelize.transaction();

        try {
            for (const row of rows) {
                const promptData = {};
                headers.forEach((header, index) => {
                    promptData[header] = formatContent(row[index], header);
                });

                // Process category
                let category = await Category.findOne({
                    where: { name: promptData?.category },
                    transaction
                });

                if (!category) {
                    category = await Category.create(
                        { name: promptData?.category },
                        { transaction }
                    );
                }

                // Process topic
                let topic = await Topic.findOne({
                    where: { name: promptData?.topic },
                    transaction
                });

                if (!topic) {
                    topic = await Topic.create(
                        { name: promptData?.topic },
                        { transaction }
                    );
                }

                // Add IDs to prompt data
                promptData.category_id = category.id;
                promptData.topic_id = topic.id;
                promptData.is_type = 1;
                prompts.push(promptData);
            }

            // Bulk insert
            if (prompts.length > 0) {
                await Prompt.bulkCreate(
                    prompts.map(p => ({
                        short_description: p.short_description || null,
                        category_id: p.category_id,
                        topic_id: p.topic_id,
                        title: p.title || null,
                        is_type: p.is_type || null,
                        content: p.short_description || null,
                        what: p.what || null,
                        created_at: new Date(),
                        updated_at: new Date(),
                        tips: p.tips || null,
                        text: p.text || null,
                        OptimationGuide: p.OptimationGuide || null,
                        how: p.how || null,
                    })),
                    { transaction }
                );
            }

            // Commit transaction
            await transaction.commit();

            parentPort.postMessage({
                success: true,
                count: prompts.length,
                data: prompts
            });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        parentPort.postMessage({
            success: false,
            error: error.message
        });
    }
}

// Start processing with the received file path
processExcelFile(workerData.filePath); 