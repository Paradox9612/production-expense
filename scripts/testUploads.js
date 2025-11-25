/**
 * File Upload Test Script
 * Tests file upload functionality with Cloudinary
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { uploadToCloudinary, deleteFromCloudinary } = require('../src/services/storageService');
const { isValidFileSize, isValidFileType, formatFileSize } = require('../src/middleware/fileUpload');

// Test counters
let passed = 0;
let failed = 0;

/**
 * Test helper function
 */
const test = (name, fn) => {
  return async () => {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${error.message}`);
      failed++;
    }
  };
};

/**
 * Test data
 */
let uploadedFilePublicId;

/**
 * Create test image buffer
 */
const createTestImageBuffer = () => {
  // Create a simple 1x1 PNG image buffer
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);
  return pngBuffer;
};

/**
 * Validation Tests
 */
const testValidFileSize = test('Validate file size - valid', async () => {
  const size = 5 * 1024 * 1024; // 5MB
  if (!isValidFileSize(size)) {
    throw new Error('5MB should be valid');
  }
});

const testInvalidFileSize = test('Validate file size - invalid', async () => {
  const size = 15 * 1024 * 1024; // 15MB
  if (isValidFileSize(size)) {
    throw new Error('15MB should be invalid');
  }
});

const testValidFileType = test('Validate file type - valid', async () => {
  const mimetype = 'image/jpeg';
  if (!isValidFileType(mimetype)) {
    throw new Error('image/jpeg should be valid');
  }
});

const testInvalidFileType = test('Validate file type - invalid', async () => {
  const mimetype = 'application/exe';
  if (isValidFileType(mimetype)) {
    throw new Error('application/exe should be invalid');
  }
});

const testFormatFileSize = test('Format file size', async () => {
  const formatted = formatFileSize(1024);
  if (formatted !== '1 KB') {
    throw new Error(`Expected "1 KB", got "${formatted}"`);
  }
});

/**
 * Cloudinary Upload Tests
 */
const testUploadImage = test('Upload image to Cloudinary', async () => {
  const imageBuffer = createTestImageBuffer();
  
  const result = await uploadToCloudinary(imageBuffer, {
    filename: 'test-image.png',
    mimetype: 'image/png'
  });

  if (!result.url) {
    throw new Error('Upload result should have URL');
  }
  if (!result.publicId) {
    throw new Error('Upload result should have public ID');
  }
  if (!result.url.includes('cloudinary.com')) {
    throw new Error('URL should be from Cloudinary');
  }

  // Store public ID for cleanup
  uploadedFilePublicId = result.publicId;
});

const testUploadWithCustomFolder = test('Upload with custom folder', async () => {
  const imageBuffer = createTestImageBuffer();
  
  const result = await uploadToCloudinary(imageBuffer, {
    filename: 'test-custom-folder.png',
    mimetype: 'image/png',
    folder: 'fieldx/test'
  });

  if (!result.publicId.includes('fieldx/test')) {
    throw new Error('Public ID should include custom folder');
  }

  // Clean up
  await deleteFromCloudinary(result.publicId, 'image');
});

const testUploadResultStructure = test('Upload result has correct structure', async () => {
  const imageBuffer = createTestImageBuffer();
  
  const result = await uploadToCloudinary(imageBuffer, {
    filename: 'test-structure.png',
    mimetype: 'image/png'
  });

  const requiredFields = ['url', 'publicId', 'filename', 'fileType', 'fileSize', 'uploadedAt'];
  for (const field of requiredFields) {
    if (!result.hasOwnProperty(field)) {
      throw new Error(`Result should have ${field} field`);
    }
  }

  // Clean up
  await deleteFromCloudinary(result.publicId, 'image');
});

const testDeleteFile = test('Delete file from Cloudinary', async () => {
  if (!uploadedFilePublicId) {
    throw new Error('No file to delete');
  }

  const result = await deleteFromCloudinary(uploadedFilePublicId, 'image');
  
  if (result.result !== 'ok') {
    throw new Error('Delete should return ok result');
  }
});

const testDeleteNonExistentFile = test('Delete non-existent file', async () => {
  try {
    await deleteFromCloudinary('non-existent-file', 'image');
    // Should not throw error, just return not found
  } catch (error) {
    // Expected behavior
  }
});

/**
 * Run all tests
 */
const runTests = async () => {
  console.log('\n========================================');
  console.log('FILE UPLOAD TEST SUITE');
  console.log('========================================\n');

  try {
    console.log('--- Validation Tests ---');
    await testValidFileSize();
    await testInvalidFileSize();
    await testValidFileType();
    await testInvalidFileType();
    await testFormatFileSize();

    console.log('\n--- Cloudinary Upload Tests ---');
    await testUploadImage();
    await testUploadWithCustomFolder();
    await testUploadResultStructure();
    await testDeleteFile();
    await testDeleteNonExistentFile();

    console.log('\n========================================');
    console.log('TEST RESULTS');
    console.log('========================================');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total:  ${passed + failed}`);
    console.log('========================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n✗ Test suite failed:', error.message);
    process.exit(1);
  }
};

// Run tests
runTests();

