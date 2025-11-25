/**
 * Report Routes
 * Defines API endpoints for report generation
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Middleware
const { authMiddleware, requireAdminOrSuperAdmin } = require('../middleware/auth');

// Controllers
const { generateExpenseReport } = require('../controllers/reportController');

// Rate limiter for report generation (10 requests per hour)
const reportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: {
    success: false,
    message: 'Too many report requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @route   GET /api/reports/expense-report
 * @desc    Generate expense report in Excel or CSV format
 * @access  Admin, Super Admin
 * @query   {String} startDate - Start date (ISO 8601 format)
 * @query   {String} endDate - End date (ISO 8601 format)
 * @query   {String} [employeeId] - Optional employee ID filter
 * @query   {String} format - Report format ('excel' or 'csv')
 * @query   {String} [status] - Optional status filter ('approved', 'pending', 'rejected', 'all')
 */
router.get(
  '/expense-report',
  authMiddleware,
  requireAdminOrSuperAdmin,
  reportRateLimiter,
  generateExpenseReport
);

module.exports = router;

