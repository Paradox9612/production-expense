/**
 * Storage Service
 * Cloudinary integration for file uploads
 */

const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

/**
 * Configure Cloudinary
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload file to Cloudinary
 * 
 * @param {Buffer} fileBuffer - File buffer from Multer
 * @param {Object} options - Upload options
 * @param {string} options.filename - Original filename
 * @param {string} options.mimetype - File mimetype
 * @param {string} options.folder - Cloudinary folder path (optional)
 * @returns {Promise<Object>} Upload result with URL and metadata
 */
const uploadToCloudinary = (fileBuffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const { filename, mimetype, folder } = options;

    // Determine resource type based on mimetype
    const resourceType = mimetype.startsWith('image/') ? 'image' : 'raw';

    // Generate folder path: fieldx/proofs/YYYY/MM/
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const folderPath = folder || `fieldx/proofs/${year}/${month}`;

    // Upload options
    const uploadOptions = {
      folder: folderPath,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true
    };

    // Add transformation for images
    if (resourceType === 'image') {
      uploadOptions.transformation = [
        {
          width: 1200,
          crop: 'limit'
        },
        {
          quality: 80
        }
      ];
    }

    // Create upload stream
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          reject(new Error(`Failed to upload file to Cloudinary: ${error.message}`));
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            filename: result.original_filename || filename,
            fileType: mimetype,
            fileSize: result.bytes,
            width: result.width,
            height: result.height,
            format: result.format,
            resourceType: result.resource_type,
            uploadedAt: new Date()
          });
        }
      }
    );

    // Convert buffer to stream and pipe to Cloudinary
    const bufferStream = Readable.from(fileBuffer);
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Delete file from Cloudinary
 * 
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - Resource type ('image' or 'raw')
 * @returns {Promise<Object>} Deletion result
 */
const deleteFromCloudinary = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete file from Cloudinary: ${error.message}`);
  }
};

/**
 * Upload multiple files to Cloudinary
 * 
 * @param {Array} files - Array of file objects with buffer, filename, mimetype
 * @param {Object} options - Upload options
 * @returns {Promise<Array>} Array of upload results
 */
const uploadMultipleToCloudinary = async (files, options = {}) => {
  try {
    const uploadPromises = files.map(file => 
      uploadToCloudinary(file.buffer, {
        filename: file.originalname,
        mimetype: file.mimetype,
        folder: options.folder
      })
    );
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error('Multiple upload error:', error);
    throw new Error(`Failed to upload files: ${error.message}`);
  }
};

/**
 * Get file info from Cloudinary
 * 
 * @param {string} publicId - Cloudinary public ID
 * @param {string} resourceType - Resource type ('image' or 'raw')
 * @returns {Promise<Object>} File info
 */
const getFileInfo = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Get file info error:', error);
    throw new Error(`Failed to get file info: ${error.message}`);
  }
};

/**
 * Generate signed URL for private files
 * 
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} options - URL options
 * @returns {string} Signed URL
 */
const generateSignedUrl = (publicId, options = {}) => {
  try {
    const signedUrl = cloudinary.url(publicId, {
      sign_url: true,
      type: 'authenticated',
      ...options
    });
    return signedUrl;
  } catch (error) {
    console.error('Generate signed URL error:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary,
  uploadMultipleToCloudinary,
  getFileInfo,
  generateSignedUrl,
  cloudinary
};

