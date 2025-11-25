/**
 * File Upload Middleware
 * Multer configuration for handling file uploads
 */

const multer = require('multer');

/**
 * Allowed file types
 */
const ALLOWED_FILE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
};

/**
 * Maximum file size (10MB)
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

/**
 * File filter function
 * Validates file type
 * 
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const fileFilter = (req, file, cb) => {
  // Check if file type is allowed
  if (ALLOWED_FILE_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type. Allowed types: ${Object.keys(ALLOWED_FILE_TYPES).join(', ')}`
      ),
      false
    );
  }
};

/**
 * Multer configuration
 * Uses memory storage (files stored in buffer, not on disk)
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: fileFilter
});

/**
 * Single file upload middleware
 * Field name: 'file'
 */
const uploadSingle = upload.single('file');

/**
 * Multiple files upload middleware
 * Field name: 'files'
 * Max count: 5 files
 */
const uploadMultiple = upload.array('files', 5);

/**
 * Error handling middleware for Multer errors
 * 
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 5 files'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name. Use "file" for single upload or "files" for multiple'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message
    });
  } else if (err) {
    // Other errors (e.g., file type validation)
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

/**
 * Get file extension from mimetype
 * 
 * @param {string} mimetype - File mimetype
 * @returns {string} File extension
 */
const getFileExtension = (mimetype) => {
  const extensions = ALLOWED_FILE_TYPES[mimetype];
  return extensions ? extensions[0] : '';
};

/**
 * Validate file size
 * 
 * @param {number} size - File size in bytes
 * @returns {boolean} True if valid, false otherwise
 */
const isValidFileSize = (size) => {
  return size <= MAX_FILE_SIZE;
};

/**
 * Validate file type
 * 
 * @param {string} mimetype - File mimetype
 * @returns {boolean} True if valid, false otherwise
 */
const isValidFileType = (mimetype) => {
  return ALLOWED_FILE_TYPES.hasOwnProperty(mimetype);
};

/**
 * Format file size for display
 * 
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  handleUploadError,
  getFileExtension,
  isValidFileSize,
  isValidFileType,
  formatFileSize,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE
};

