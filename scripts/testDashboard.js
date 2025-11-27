/**
 * Test Script for Dashboard System
 * Tests all dashboard endpoints and aggregation queries
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
 * Test 2: User login
 */
const testUserLogin = test('User login', async () => {
  const response = await axios.post(`${API_URL}/auth/login`, {
    email: 'user@fieldx.com',
    password: 'user123'
  });

  if (!response.data.success) {
    throw new Error('Login failed');
  }

  userToken = response.data.data.token;
  testUserId = response.data.data.user._id;
  
  if (!userToken || !testUserId) {
    throw new Error('No token or user ID received');
  }
});

/**
 * Test 3: Get admin dashboard
 */
const testGetAdminDashboard = test('Get admin dashboard', async () => {
  const api = authRequest(adminToken);
  const response = await api.get('/dashboard/admin');

  if (!response.data.success) {
    throw new Error('Failed to get admin dashboard');
  }

  const data = response.data.data;

  // Verify structure
  if (!data.overview) {
    throw new Error('Overview missing');
  }

  if (!data.topSpenders) {
    throw new Error('Top spenders missing');
  }

  if (!data.lowBalanceEmployees) {
    throw new Error('Low balance employees missing');
  }

  if (!data.monthStats) {
    throw new Error('Month stats missing');
  }

  // Verify overview fields
  if (typeof data.overview.pendingApprovals !== 'number') {
    throw new Error('Pending approvals should be a number');
  }

  if (typeof data.overview.thisMonthTotal !== 'number') {
    throw new Error('This month total should be a number');
  }

  if (typeof data.overview.totalEmployees !== 'number') {
    throw new Error('Total employees should be a number');
  }

  if (typeof data.overview.activeJourneys !== 'number') {
    throw new Error('Active journeys should be a number');
  }

  // Verify arrays
  if (!Array.isArray(data.topSpenders)) {
    throw new Error('Top spenders should be an array');
  }

  if (!Array.isArray(data.lowBalanceEmployees)) {
    throw new Error('Low balance employees should be an array');
  }
});

/**
 * Test 4: Get user dashboard
 */
const testGetUserDashboard = test('Get user dashboard', async () => {
  const api = authRequest(userToken);
  const response = await api.get(`/dashboard/user/${testUserId}`);

  if (!response.data.success) {
    throw new Error('Failed to get user dashboard');
  }

  const data = response.data.data;

  // Verify structure
  if (!data.user) {
    throw new Error('User info missing');
  }

  if (!data.summary) {
    throw new Error('Summary missing');
  }

  if (!data.trendData) {
    throw new Error('Trend data missing');
  }

  if (!data.expenseBreakdown) {
    throw new Error('Expense breakdown missing');
  }

  // Verify user info
  if (data.user.id !== testUserId) {
    throw new Error('Wrong user ID');
  }

  // Verify summary fields
  if (typeof data.summary.currentBalance !== 'number') {
    throw new Error('Current balance should be a number');
  }

  if (!data.summary.pendingExpenses) {
    throw new Error('Pending expenses missing');
  }

  if (!data.summary.approvedThisMonth) {
    throw new Error('Approved this month missing');
  }

  // Verify trend data structure
  if (!data.trendData.labels || !data.trendData.datasets) {
    throw new Error('Trend data should have labels and datasets');
  }

  // Verify expense breakdown
  if (!Array.isArray(data.expenseBreakdown)) {
    throw new Error('Expense breakdown should be an array');
  }
});

/**
 * Test 5: Get monthly summary
 */
const testGetMonthlySummary = test('Get monthly summary', async () => {
  const api = authRequest(userToken);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const response = await api.get(`/dashboard/monthly/${testUserId}/${year}/${month}`);

  if (!response.data.success) {
    throw new Error('Failed to get monthly summary');
  }

  const data = response.data.data;

  // Verify structure
  if (!data.user) {
    throw new Error('User info missing');
  }

  if (!data.period) {
    throw new Error('Period info missing');
  }

  if (!data.summary) {
    throw new Error('Summary missing');
  }

  if (!data.categoryBreakdown) {
    throw new Error('Category breakdown missing');
  }

  if (!data.categoryChartData) {
    throw new Error('Category chart data missing');
  }

  // Verify period
  if (data.period.year !== year) {
    throw new Error('Wrong year in period');
  }

  if (data.period.month !== month) {
    throw new Error('Wrong month in period');
  }

  // Verify summary fields
  if (typeof data.summary.totalExpenses !== 'number') {
    throw new Error('Total expenses should be a number');
  }

  if (typeof data.summary.approvalRate !== 'number') {
    throw new Error('Approval rate should be a number');
  }

  // Verify arrays
  if (!Array.isArray(data.categoryBreakdown)) {
    throw new Error('Category breakdown should be an array');
  }

  if (!Array.isArray(data.expensesByStatus)) {
    throw new Error('Expenses by status should be an array');
  }

  // Verify chart data
  if (!data.categoryChartData.labels || !data.categoryChartData.datasets) {
    throw new Error('Chart data should have labels and datasets');
  }
});

/**
 * Test 6: Admin can access any user's dashboard
 */
const testAdminAccessUserDashboard = test('Admin can access any user dashboard', async () => {
  const api = authRequest(adminToken);
  const response = await api.get(`/dashboard/user/${testUserId}`);

  if (!response.data.success) {
    throw new Error('Admin should be able to access user dashboard');
  }

  const data = response.data.data;
  if (data.user.id !== testUserId) {
    throw new Error('Wrong user data returned');
  }
});

/**
 * Test 7: User cannot access another user's dashboard
 */
const testUserCannotAccessOtherDashboard = test('User cannot access another user dashboard', async () => {
  const api = authRequest(userToken);

  // Try to access admin's dashboard (assuming admin has a different ID)
  try {
    // Get admin user ID first
    const adminApi = authRequest(adminToken);
    const adminProfileResponse = await adminApi.get('/employees');
    const adminUser = adminProfileResponse.data.data.employees.find(e => e.role === 'admin');

    if (adminUser && adminUser._id !== testUserId) {
      await api.get(`/dashboard/user/${adminUser._id}`);
      throw new Error('Should have failed - user cannot access another user dashboard');
    } else {
      // Skip test if we can't find another user
      console.log('  (Skipped - no other user found)');
    }
  } catch (error) {
    if (error.response && error.response.status === 403) {
      // Expected error
      return;
    }
    throw error;
  }
});

/**
 * Test 8: Non-admin cannot access admin dashboard
 */
const testNonAdminCannotAccessAdminDashboard = test('Non-admin cannot access admin dashboard', async () => {
  const api = authRequest(userToken);

  try {
    await api.get('/dashboard/admin');
    throw new Error('Should have failed - non-admin cannot access admin dashboard');
  } catch (error) {
    if (error.response && error.response.status === 403) {
      // Expected error
      return;
    }
    throw error;
  }
});

/**
 * Test 9: Invalid month/year validation
 */
const testInvalidMonthYear = test('Invalid month/year validation', async () => {
  const api = authRequest(userToken);

  try {
    await api.get(`/dashboard/monthly/${testUserId}/2025/13`); // Invalid month
    throw new Error('Should have failed with invalid month');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      // Expected error
      return;
    }
    throw error;
  }
});

/**
 * Test 10: Top spenders data structure
 */
const testTopSpendersStructure = test('Top spenders data structure', async () => {
  const api = authRequest(adminToken);
  const response = await api.get('/dashboard/admin');

  if (!response.data.success) {
    throw new Error('Failed to get admin dashboard');
  }

  const topSpenders = response.data.data.topSpenders;

  if (topSpenders.length > 0) {
    const spender = topSpenders[0];

    // Verify required fields
    if (!spender.name) {
      throw new Error('Top spender should have name');
    }

    if (!spender.employeeId) {
      throw new Error('Top spender should have employeeId');
    }

    if (typeof spender.totalExpenses !== 'number') {
      throw new Error('Total expenses should be a number');
    }

    if (typeof spender.expenseCount !== 'number') {
      throw new Error('Expense count should be a number');
    }
  }
});

/**
 * Run all tests
 */
const runTests = async () => {
  console.log('\n========================================');
  console.log('DASHBOARD TEST SUITE');
  console.log('========================================\n');

  try {
    console.log('--- Authentication Tests ---');
    await testAdminLogin();
    await testUserLogin();

    console.log('\n--- Admin Dashboard Tests ---');
    await testGetAdminDashboard();
    await testTopSpendersStructure();

    console.log('\n--- User Dashboard Tests ---');
    await testGetUserDashboard();
    await testGetMonthlySummary();

    console.log('\n--- Authorization Tests ---');
    await testAdminAccessUserDashboard();
    await testUserCannotAccessOtherDashboard();
    await testNonAdminCannotAccessAdminDashboard();

    console.log('\n--- Validation Tests ---');
    await testInvalidMonthYear();

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


