/**
 * Test Script for Advance Payment System
 * Tests all advance payment endpoints and balance calculations
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://72.61.227.176:5000/api';

// Test counters
let passed = 0;
let failed = 0;

// Test data storage
let adminToken = '';
let userToken = '';
let testUserId = '';
let testAdvanceId = '';

/**
 * Helper function to run a test
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
      if (error.response) {
        console.error(`  Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      failed++;
    }
  };
};

/**
 * Helper function to make authenticated requests
 */
const authRequest = (token) => {
  return axios.create({
    baseURL: API_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
};

/**
 * Test 1: Admin login
 */
const testAdminLogin = test('Admin login', async () => {
  const response = await axios.post(`${API_URL}/auth/login`, {
    email: 'admin@fieldx.com',
    password: 'admin123'
  });

  if (!response.data.success) {
    throw new Error('Login failed');
  }

  adminToken = response.data.data.token;
  if (!adminToken) {
    throw new Error('No token received');
  }
});

/**
 * Test 2: Create test employee
 */
const testCreateEmployee = test('Create test employee', async () => {
  const api = authRequest(adminToken);
  const response = await api.post('/employees', {
    email: `test-advance-${Date.now()}@fieldx.com`,
    password: 'Test@123',
    name: 'Test Advance User',
    employeeId: `TADV${Date.now().toString().slice(-6)}`,
    role: 'user'
  });

  if (!response.data.success) {
    throw new Error('Employee creation failed');
  }

  testUserId = response.data.data.employee._id;
  if (!testUserId) {
    throw new Error('No employee ID received');
  }
});

/**
 * Test 3: Add advance payment
 */
const testAddAdvance = test('Add advance payment', async () => {
  const api = authRequest(adminToken);
  const response = await api.post('/advances', {
    userId: testUserId,
    amount: 5000,
    description: 'Monthly travel advance',
    notes: 'Advance for November 2025',
    paymentMethod: 'bank_transfer',
    transactionReference: 'TXN123456'
  });

  if (!response.data.success) {
    throw new Error('Advance creation failed');
  }

  testAdvanceId = response.data.data.advance._id;
  const newBalance = response.data.data.newBalance;

  if (newBalance !== 5000) {
    throw new Error(`Expected balance 5000, got ${newBalance}`);
  }
});

/**
 * Test 4: Add advance with proof URL
 */
const testAddAdvanceWithProof = test('Add advance with proof URL', async () => {
  const api = authRequest(adminToken);
  const response = await api.post('/advances', {
    userId: testUserId,
    amount: 3000,
    description: 'Additional advance',
    proofUrl: 'https://res.cloudinary.com/demo/image/upload/v1234567890/proof.jpg',
    paymentMethod: 'upi'
  });

  if (!response.data.success) {
    throw new Error('Advance with proof creation failed');
  }

  const newBalance = response.data.data.newBalance;
  if (newBalance !== 8000) {
    throw new Error(`Expected balance 8000, got ${newBalance}`);
  }
});

/**
 * Test 5: Validate amount > 0
 */
const testValidateAmount = test('Validate amount > 0', async () => {
  const api = authRequest(adminToken);

  try {
    await api.post('/advances', {
      userId: testUserId,
      amount: -100,
      description: 'Invalid amount'
    });
    throw new Error('Should have failed with negative amount');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      // Expected error
      return;
    }
    throw error;
  }
});

/**
 * Test 6: Get all advances
 */
const testGetAllAdvances = test('Get all advances', async () => {
  const api = authRequest(adminToken);
  const response = await api.get('/advances');

  if (!response.data.success) {
    throw new Error('Failed to get advances');
  }

  const advances = response.data.data.advances;
  if (!Array.isArray(advances)) {
    throw new Error('Advances should be an array');
  }

  if (advances.length < 2) {
    throw new Error(`Expected at least 2 advances, got ${advances.length}`);
  }
});

/**
 * Test 7: Get advances with filters
 */
const testGetAdvancesWithFilters = test('Get advances with filters', async () => {
  const api = authRequest(adminToken);
  const response = await api.get('/advances', {
    params: {
      userId: testUserId,
      status: 'completed',
      paymentMethod: 'bank_transfer'
    }
  });

  if (!response.data.success) {
    throw new Error('Failed to get filtered advances');
  }

  const advances = response.data.data.advances;
  if (advances.length < 1) {
    throw new Error('Expected at least 1 advance with filters');
  }

  // Verify all advances match filters
  advances.forEach(adv => {
    if (adv.userId._id !== testUserId) {
      throw new Error('Filter by userId failed');
    }
    if (adv.status !== 'completed') {
      throw new Error('Filter by status failed');
    }
  });
});

/**
 * Test 8: Get advance by ID
 */
const testGetAdvanceById = test('Get advance by ID', async () => {
  const api = authRequest(adminToken);
  const response = await api.get(`/advances/${testAdvanceId}`);

  if (!response.data.success) {
    throw new Error('Failed to get advance by ID');
  }

  const advance = response.data.data.advance;
  if (advance._id !== testAdvanceId) {
    throw new Error('Wrong advance returned');
  }

  if (advance.amount !== 5000) {
    throw new Error(`Expected amount 5000, got ${advance.amount}`);
  }
});

/**
 * Test 9: Get advance history for user
 */
const testGetAdvanceHistory = test('Get advance history for user', async () => {
  const api = authRequest(adminToken);
  const response = await api.get(`/advances/user/${testUserId}`);

  if (!response.data.success) {
    throw new Error('Failed to get advance history');
  }

  const data = response.data.data;

  // Check user info
  if (data.user.id !== testUserId) {
    throw new Error('Wrong user in history');
  }

  // Check summary
  if (!data.summary) {
    throw new Error('Summary missing');
  }

  if (data.summary.totalAdvances !== 8000) {
    throw new Error(`Expected total advances 8000, got ${data.summary.totalAdvances}`);
  }

  // Check transactions
  if (!Array.isArray(data.transactions)) {
    throw new Error('Transactions should be an array');
  }

  if (data.transactions.length < 2) {
    throw new Error('Expected at least 2 transactions');
  }

  // Verify running balance calculation
  const lastTransaction = data.transactions[data.transactions.length - 1];
  if (lastTransaction.runningBalance !== 8000) {
    throw new Error(`Expected running balance 8000, got ${lastTransaction.runningBalance}`);
  }
});

/**
 * Test 10: Pagination
 */
const testPagination = test('Pagination', async () => {
  const api = authRequest(adminToken);
  const response = await api.get('/advances', {
    params: {
      page: 1,
      limit: 1
    }
  });

  if (!response.data.success) {
    throw new Error('Failed to get paginated advances');
  }

  const pagination = response.data.data.pagination;
  if (pagination.limit !== 1) {
    throw new Error('Pagination limit not applied');
  }

  const advances = response.data.data.advances;
  if (advances.length > 1) {
    throw new Error('Pagination not working');
  }
});

/**
 * Test 11: Non-admin cannot add advance
 */
const testNonAdminCannotAddAdvance = test('Non-admin cannot add advance', async () => {
  // First login as user
  const loginResponse = await axios.post(`${API_URL}/auth/login`, {
    email: 'user@fieldx.com',
    password: 'user123'
  });

  if (loginResponse.data.success) {
    userToken = loginResponse.data.data.token;
  }

  const api = authRequest(userToken);

  try {
    await api.post('/advances', {
      userId: testUserId,
      amount: 1000,
      description: 'Unauthorized advance'
    });
    throw new Error('Should have failed - non-admin cannot add advance');
  } catch (error) {
    if (error.response && error.response.status === 403) {
      // Expected error
      return;
    }
    throw error;
  }
});

/**
 * Test 12: Balance calculation accuracy
 */
const testBalanceCalculation = test('Balance calculation accuracy', async () => {
  const api = authRequest(adminToken);

  // Get current balance
  const historyResponse = await api.get(`/advances/user/${testUserId}`);
  const currentBalance = historyResponse.data.data.summary.currentBalance;

  // Get user details
  const userResponse = await api.get(`/employees/${testUserId}`);
  const userBalance = userResponse.data.data.employee.advanceBalance;

  if (currentBalance !== userBalance) {
    throw new Error(`Balance mismatch: calculated ${currentBalance}, user has ${userBalance}`);
  }
});

/**
 * Run all tests
 */
const runTests = async () => {
  console.log('\n========================================');
  console.log('ADVANCE PAYMENT TEST SUITE');
  console.log('========================================\n');

  try {
    console.log('--- Authentication Tests ---');
    await testAdminLogin();

    console.log('\n--- Setup Tests ---');
    await testCreateEmployee();

    console.log('\n--- Create Advance Tests ---');
    await testAddAdvance();
    await testAddAdvanceWithProof();

    console.log('\n--- Validation Tests ---');
    await testValidateAmount();

    console.log('\n--- Read Tests ---');
    await testGetAllAdvances();
    await testGetAdvancesWithFilters();
    await testGetAdvanceById();
    await testGetAdvanceHistory();

    console.log('\n--- Pagination Tests ---');
    await testPagination();

    console.log('\n--- Authorization Tests ---');
    await testNonAdminCannotAddAdvance();

    console.log('\n--- Balance Calculation Tests ---');
    await testBalanceCalculation();

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
    console.error(error.stack);
    process.exit(1);
  }
};

// Run tests
runTests();


