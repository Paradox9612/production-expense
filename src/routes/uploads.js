/**
 * Upload Routes
 * Routes for file upload operations
 */

const express = require('express');
const router = express.Router();

// Middleware
const { authMiddleware } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, handleUploadError } = require('../middleware/fileUpload');

// Controllers
const {
  uploadFile,
  uploadMultipleFiles,
  deleteFile
} = require('../controllers/uploadController');

/**
 * All routes require authentication
 */
router.use(authMiddleware);

/**
 * @route   POST /api/uploads
 * @desc    Upload single file
 * @access  Private
 */
router.post(
  '/',
  uploadSingle,
  handleUploadError,
  uploadFile
);

/**
 * @route   POST /api/uploads/multiple
 * @desc    Upload multiple files (max 5)
 * @access  Private
 */
router.post(
  '/multiple',
  uploadMultiple,
  handleUploadError,
  uploadMultipleFiles
);

/**
 * @route   DELETE /api/uploads/:publicId
 * @desc    Delete file from Cloudinary
 * @access  Private (admin only)
 */
router.delete(
  '/:publicId',
  deleteFile
);

module.exports = router;

