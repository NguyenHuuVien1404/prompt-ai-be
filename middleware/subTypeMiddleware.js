const UserSub = require('../models/UserSub');
const { Op } = require('sequelize');

const checkSubTypeAccess = async (req, res, next) => {
    try {
        // Allow access to all prompts without any subscription checks
        req.subTypeAccess = [1, 2];
        next();
    } catch (error) {
        console.error('Error in checkSubTypeAccess:', error);
        res.status(500).json({ message: 'Error checking subscription access' });
    }
};

module.exports = checkSubTypeAccess; 