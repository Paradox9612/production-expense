/**
 * Dashboard Routes
 * Handles routing for dashboard statistics and reports
 */

const express = require('express');
const router = express.Router();
const {
  getAdminDashboard,
  getUserDashboard,
  getMonthSummary
} = require('../controllers/dashboardController');
const { authMiddleware, adminOnly } = require('../middleware/auth');

/**
 * @route   GET /api/dashboard/admin
 * @desc    Get admin dashboard statistics
 * @access  Admin only
 */
router.get(
  '/admin',
  authMiddleware,
  adminOnly,
  getAdminDashboard
);

/**
 * @route   GET /api/dashboard/user/:id
 * @desc    Get user dashboard statistics
 * @access  Admin and user (own data only)
 */
router.get(
  '/user/:id',
  authMiddleware,
  getUserDashboard
);

/**
 * @route   GET /api/dashboard/monthly/:userId/:year/:month
 * @desc    Get monthly summary for a user
 * @access  Admin and user (own data only)
 */
router.get(
  '/monthly/:userId/:year/:month',
  authMiddleware,
  getMonthSummary
);

module.exports = router;

