/**
 * Employee Routes
 * All routes require admin authentication
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  updatePassword
} = require('../controllers/employeeController');
const {
  validate,
  validateObjectId,
  createEmployeeSchema,
  updateEmployeeSchema,
  updatePasswordSchema,
  paginationSchema
} = require('../utils/validators');

/**
 * Apply authentication and admin-only middleware to all routes
 */
router.use(authMiddleware);
router.use(adminOnly);

/**
 * @route   GET /api/employees
 * @desc    Get all employees with pagination and search
 * @access  Admin only
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 10, max: 100)
 * @query   search - Search by name, email, or employeeId
 * @query   role - Filter by role (admin/user)
 * @query   isActive - Filter by active status (true/false)
 */
router.get(
  '/',
  validate(paginationSchema, 'query'),
  getAllEmployees
);

/**
 * @route   POST /api/employees
 * @desc    Create a new employee
 * @access  Admin only
 * @body    email, name, password (optional), employeeId (optional), role, bankDetails, upiId, isActive
 */
router.post(
  '/',
  validate(createEmployeeSchema),
  createEmployee
);

/**
 * @route   GET /api/employees/:id
 * @desc    Get employee by ID
 * @access  Admin only
 * @param   id - Employee MongoDB ObjectId
 */
router.get(
  '/:id',
  validateObjectId('id'),
  getEmployeeById
);

/**
 * @route   PUT /api/employees/:id
 * @desc    Update employee details
 * @access  Admin only
 * @param   id - Employee MongoDB ObjectId
 * @body    Fields to update (email, name, employeeId, role, bankDetails, upiId, isActive)
 * @note    Cannot update password through this endpoint - use PUT /api/employees/:id/password
 */
router.put(
  '/:id',
  validateObjectId('id'),
  validate(updateEmployeeSchema),
  updateEmployee
);

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete employee (soft delete - sets isActive to false)
 * @access  Admin only
 * @param   id - Employee MongoDB ObjectId
 * @note    Cannot delete your own account
 */
router.delete(
  '/:id',
  validateObjectId('id'),
  deleteEmployee
);

/**
 * @route   PUT /api/employees/:id/password
 * @desc    Update employee password
 * @access  Admin only
 * @param   id - Employee MongoDB ObjectId
 * @body    newPassword, confirmPassword
 */
router.put(
  '/:id/password',
  validateObjectId('id'),
  validate(updatePasswordSchema),
  updatePassword
);

module.exports = router;

