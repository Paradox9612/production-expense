/**
 * Upload Controller
 * Handles file uploads to Cloudinary
 */

const { uploadToCloudinary, deleteFromCloudinary, uploadMultipleToCloudinary } = require('../services/storageService');
const { formatFileSize } = require('../middleware/fileUpload');
const Audit = require('../models/Audit');

/**
 * Upload single file
 * POST /api/uploads
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const uploadFile = async (req, res) => {
  try {
    // Check if file exists
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please provide a file in the "file" field'
      });
    }

    const userId = req.user.userId;
    const file = req.file;

    // Upload to Cloudinary
    const uploadResult = await uploadToCloudinary(file.buffer, {
      filename: file.originalname,
      mimetype: file.mimetype
    });

    // Audit log
    await Audit.log({
      action: 'file_uploaded',
      performedBy: userId,
      metadata: {
        filename: uploadResult.filename,
        fileType: uploadResult.fileType,
        fileSize: uploadResult.fileSize,
        url: uploadResult.url,
        publicId: uploadResult.publicId
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: uploadResult.url,
        filename: uploadResult.filename,
        fileType: uploadResult.fileType,
        fileSize: uploadResult.fileSize,
        fileSizeFormatted: formatFileSize(uploadResult.fileSize),
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        publicId: uploadResult.publicId,
        uploadedAt: uploadResult.uploadedAt
      }
    });
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload file',
      error: error.message
    });
  }
};

/**
 * Upload multiple files
 * POST /api/uploads/multiple
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const uploadMultipleFiles = async (req, res) => {
  try {
    // Check if files exist
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded. Please provide files in the "files" field'
      });
    }

    const userId = req.user.userId;
    const files = req.files;

    // Upload all files to Cloudinary
    const uploadResults = await uploadMultipleToCloudinary(files);

    // Audit log for each file
    for (const result of uploadResults) {
      await Audit.log({
        action: 'file_uploaded',
        performedBy: userId,
        metadata: {
          filename: result.filename,
          fileType: result.fileType,
          fileSize: result.fileSize,
          url: result.url,
          publicId: result.publicId
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }

    // Format response
    const formattedResults = uploadResults.map(result => ({
      url: result.url,
      filename: result.filename,
      fileType: result.fileType,
      fileSize: result.fileSize,
      fileSizeFormatted: formatFileSize(result.fileSize),
      width: result.width,
      height: result.height,
      format: result.format,
      publicId: result.publicId,
      uploadedAt: result.uploadedAt
    }));

    res.json({
      success: true,
      message: `${uploadResults.length} file(s) uploaded successfully`,
      data: {
        files: formattedResults,
        count: uploadResults.length,
        totalSize: uploadResults.reduce((sum, r) => sum + r.fileSize, 0)
      }
    });
  } catch (error) {
    console.error('Upload multiple files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload files',
      error: error.message
    });
  }
};

/**
 * Delete file
 * DELETE /api/uploads/:publicId
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteFile = async (req, res) => {
  try {
    const { publicId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Only admins can delete files
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can delete files'
      });
    }

    // Decode public ID (replace - with /)
    const decodedPublicId = publicId.replace(/-/g, '/');

    // Determine resource type from public ID
    const resourceType = decodedPublicId.includes('fieldx/proofs') ? 'raw' : 'image';

    // Delete from Cloudinary
    const deleteResult = await deleteFromCloudinary(decodedPublicId, resourceType);

    if (deleteResult.result !== 'ok') {
      return res.status(404).json({
        success: false,
        message: 'File not found or already deleted'
      });
    }

    // Audit log
    await Audit.log({
      action: 'file_deleted',
      performedBy: userId,
      metadata: {
        publicId: decodedPublicId,
        resourceType
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'File deleted successfully',
      data: {
        publicId: decodedPublicId,
        result: deleteResult.result
      }
    });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete file',
      error: error.message
    });
  }
};

module.exports = {
  uploadFile,
  uploadMultipleFiles,
  deleteFile
};

