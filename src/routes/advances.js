/**
 * Advance Routes
 * Handles routing for advance payment operations
 */

const express = require('express');
const router = express.Router();
const {
  addAdvance,
  getAdvances,
  getAdvanceHistory,
  getAdvanceById
} = require('../controllers/advanceController');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { validate } = require('../utils/validators');
const {
  createAdvanceSchema,
  getAdvancesSchema,
  advanceIdSchema
} = require('../utils/validators');

/**
 * @route   POST /api/advances
 * @desc    Add advance payment to employee
 * @access  Admin only
 */
router.post(
  '/',
  authMiddleware,
  adminOnly,
  validate(createAdvanceSchema),
  addAdvance
);

/**
 * @route   GET /api/advances
 * @desc    Get all advances with filters
 * @access  Admin only
 */
router.get(
  '/',
  authMiddleware,
  adminOnly,
  validate(getAdvancesSchema, 'query'),
  getAdvances
);

/**
 * @route   GET /api/advances/user/:userId
 * @desc    Get advance history for a specific user
 * @access  Admin and user (own data only)
 */
router.get(
  '/user/:userId',
  authMiddleware,
  validate(advanceIdSchema, 'params'),
  getAdvanceHistory
);

/**
 * @route   GET /api/advances/:id
 * @desc    Get advance by ID
 * @access  Admin and user (own data only)
 */
router.get(
  '/:id',
  authMiddleware,
  validate(advanceIdSchema, 'params'),
  getAdvanceById
);

module.exports = router;

