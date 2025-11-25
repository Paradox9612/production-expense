/**
 * Expense Routes
 * Defines API endpoints for expense management
 */

const express = require('express');
const router = express.Router();

// Middleware
const { authMiddleware } = require('../middleware/auth');
const {
  validate,
  validateObjectId,
  createExpenseSchema,
  updateExpenseSchema,
  expenseFilterSchema,
  approveExpenseSchema,
  rejectExpenseSchema,
  bulkApproveSchema
} = require('../utils/validators');

// Controllers
const {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense
} = require('../controllers/expenseController');

const {
  approveExpense,
  rejectExpense,
  bulkApproveExpenses
} = require('../controllers/approvalController');

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * @route   POST /api/expenses
 * @desc    Create a new expense
 * @access  Private (authenticated users)
 */
router.post(
  '/',
  validate(createExpenseSchema),
  createExpense
);

/**
 * @route   GET /api/expenses
 * @desc    Get all expenses with filtering and pagination
 * @access  Private (authenticated users, admin can see all)
 */
router.get(
  '/',
  validate(expenseFilterSchema, 'query'),
  getAllExpenses
);

/**
 * @route   GET /api/expenses/:id
 * @desc    Get expense by ID
 * @access  Private (owner or admin)
 */
router.get(
  '/:id',
  validateObjectId('id'),
  getExpenseById
);

/**
 * @route   PUT /api/expenses/:id
 * @desc    Update expense (before approval only)
 * @access  Private (owner or admin)
 */
router.put(
  '/:id',
  validateObjectId('id'),
  validate(updateExpenseSchema),
  updateExpense
);

/**
 * @route   DELETE /api/expenses/:id
 * @desc    Delete expense (before approval only)
 * @access  Private (owner or admin)
 */
router.delete(
  '/:id',
  validateObjectId('id'),
  deleteExpense
);

/**
 * @route   POST /api/expenses/bulk-approve
 * @desc    Bulk approve expenses
 * @access  Private (admin only)
 */
router.post(
  '/bulk-approve',
  validate(bulkApproveSchema),
  bulkApproveExpenses
);

/**
 * @route   POST /api/expenses/:id/approve
 * @desc    Approve an expense
 * @access  Private (admin only)
 */
router.post(
  '/:id/approve',
  validateObjectId('id'),
  validate(approveExpenseSchema),
  approveExpense
);

/**
 * @route   POST /api/expenses/:id/reject
 * @desc    Reject an expense
 * @access  Private (admin only)
 */
router.post(
  '/:id/reject',
  validateObjectId('id'),
  validate(rejectExpenseSchema),
  rejectExpense
);

module.exports = router;

