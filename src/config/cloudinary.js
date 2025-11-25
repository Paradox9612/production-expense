/**
 * Cloudinary Configuration
 * Cloud storage for file uploads (images, PDFs, documents)
 */

const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Test connection
const testConnection = async () => {
  try {
    await cloudinary.api.ping();
    console.log('✅ Cloudinary connected successfully');
  } catch (error) {
    console.error('❌ Cloudinary connection failed:', error.message);
  }
};

// Only test in development
if (process.env.NODE_ENV === 'development') {
  testConnection();
}

module.exports = cloudinary;

