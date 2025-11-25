/**
 * Settings Routes
 * Handles system-wide configuration settings
 */

const express = require('express');
const router = express.Router();
const {
  getAllSettings,
  getSettingsByCategory,
  getSetting,
  updateSetting,
  initializeSettings
} = require('../controllers/settingsController');
const authMiddleware = require('../middleware/auth');
const { requireAdminOrSuperAdmin, requireSuperAdmin } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /api/settings
 * @desc    Get all settings
 * @access  Admin/SuperAdmin
 */
router.get('/', requireAdminOrSuperAdmin, getAllSettings);

/**
 * @route   GET /api/settings/category/:category
 * @desc    Get settings by category
 * @access  Admin/SuperAdmin
 */
router.get('/category/:category', requireAdminOrSuperAdmin, getSettingsByCategory);

/**
 * @route   POST /api/settings/initialize
 * @desc    Initialize default settings
 * @access  SuperAdmin only
 */
router.post('/initialize', requireSuperAdmin, initializeSettings);

/**
 * @route   GET /api/settings/:key
 * @desc    Get single setting by key
 * @access  Admin/SuperAdmin
 */
router.get('/:key', requireAdminOrSuperAdmin, getSetting);

/**
 * @route   PUT /api/settings/:key
 * @desc    Update setting
 * @access  Admin/SuperAdmin
 */
router.put('/:key', requireAdminOrSuperAdmin, updateSetting);

module.exports = router;

