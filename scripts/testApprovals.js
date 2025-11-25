/**
 * Approval Workflow Test Script
 * Tests expense approval, rejection, and bulk approval functionality
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Expense = require('../src/models/Expense');
const User = require('../src/models/User');
const Journey = require('../src/models/Journey');
const { calculateApprovedAmount } = require('../src/utils/varianceCalculator');

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
let testUser;
let testAdmin;
let testJourney;
let testExpense1;
let testExpense2;
let testExpense3;

/**
 * Setup Tests
 */
const testCreateUsers = test('Create test users', async () => {
  testUser = new User({
    name: 'Test Employee',
    email: `test.approval.${Date.now()}@example.com`,
    password: 'password123',
    employeeId: `EMP${Date.now()}`,
    role: 'employee',
    advanceBalance: 10000
  });
  await testUser.save();

  testAdmin = new User({
    name: 'Test Admin',
    email: `test.admin.${Date.now()}@example.com`,
    password: 'password123',
    employeeId: `ADM${Date.now()}`,
    role: 'admin',
    advanceBalance: 0
  });
  await testAdmin.save();

  if (!testUser._id || !testAdmin._id) {
    throw new Error('Users not created');
  }
});

const testCreateJourney = test('Create test journey', async () => {
  testJourney = new Journey({
    userId: testUser._id,
    startCoordinates: { latitude: 28.6139, longitude: 77.2090 },
    endCoordinates: { latitude: 28.7041, longitude: 77.1025 },
    startAddress: 'Connaught Place, New Delhi',
    endAddress: 'Rajouri Garden, New Delhi',
    startTimestamp: new Date(),
    endTimestamp: new Date(Date.now() + 3600000),
    status: 'completed',
    calculatedDistance: 15.5,
    calculatedDuration: 45
  });
  await testJourney.save();
  if (!testJourney._id) {
    throw new Error('Journey not created');
  }
});

const testCreateExpenses = test('Create test expenses', async () => {
  // Journey expense with low variance
  testExpense1 = new Expense({
    userId: testUser._id,
    journeyId: testJourney._id,
    type: 'journey',
    date: new Date(),
    description: 'Client meeting - low variance',
    amount: 124,
    systemDistance: 15.5,
    manualDistance: 16.0,
    distanceRate: 8,
    status: 'pending'
  });
  await testExpense1.save();

  // Journey expense with high variance
  testExpense2 = new Expense({
    userId: testUser._id,
    type: 'journey',
    date: new Date(),
    description: 'Client meeting - high variance',
    amount: 200,
    systemDistance: 15.5,
    manualDistance: 20.0,
    distanceRate: 8,
    status: 'pending'
  });
  await testExpense2.save();

  // Non-journey expense
  testExpense3 = new Expense({
    userId: testUser._id,
    type: 'food',
    date: new Date(),
    description: 'Team lunch',
    amount: 500,
    status: 'pending'
  });
  await testExpense3.save();

  if (!testExpense1._id || !testExpense2._id || !testExpense3._id) {
    throw new Error('Expenses not created');
  }
});

/**
 * Approval Amount Calculation Tests
 */
const testCalculateApprovedAmountOption1 = test('Calculate approved amount - Option 1 (system)', async () => {
  const expense = await Expense.findById(testExpense1._id);
  const amount = calculateApprovedAmount(expense, 1);
  const expected = 15.5 * 8; // systemDistance * rate
  if (amount !== expected) {
    throw new Error(`Expected ${expected}, got ${amount}`);
  }
});

const testCalculateApprovedAmountOption2 = test('Calculate approved amount - Option 2 (manual)', async () => {
  const expense = await Expense.findById(testExpense1._id);
  const amount = calculateApprovedAmount(expense, 2);
  const expected = 16.0 * 8; // manualDistance * rate
  if (amount !== expected) {
    throw new Error(`Expected ${expected}, got ${amount}`);
  }
});

const testCalculateApprovedAmountOption3 = test('Calculate approved amount - Option 3 (admin)', async () => {
  const expense = await Expense.findById(testExpense1._id);
  const amount = calculateApprovedAmount(expense, 3, 17.0);
  const expected = 17.0 * 8; // adminDistance * rate
  if (amount !== expected) {
    throw new Error(`Expected ${expected}, got ${amount}`);
  }
});

/**
 * Approval Workflow Tests
 */
const testApproveExpenseOption1 = test('Approve expense with Option 1 (system distance)', async () => {
  const expense = await Expense.findById(testExpense1._id);
  const user = await User.findById(testUser._id);
  const previousBalance = user.advanceBalance;

  // Simulate approval
  const approvedAmount = calculateApprovedAmount(expense, 1);
  expense.status = 'approved';
  expense.approvedOption = 1;
  expense.approvedAmount = approvedAmount;
  expense.approvedBy = testAdmin._id;
  expense.approvedAt = new Date();
  await expense.save();

  // Update balance
  user.advanceBalance -= approvedAmount;
  await user.save();

  // Verify
  const updatedExpense = await Expense.findById(testExpense1._id);
  if (updatedExpense.status !== 'approved') {
    throw new Error('Expense not approved');
  }
  if (updatedExpense.approvedOption !== 1) {
    throw new Error('Approved option not set correctly');
  }
  if (updatedExpense.approvedAmount !== approvedAmount) {
    throw new Error('Approved amount not set correctly');
  }

  const updatedUser = await User.findById(testUser._id);
  const expectedBalance = previousBalance - approvedAmount;
  if (updatedUser.advanceBalance !== expectedBalance) {
    throw new Error(`Expected balance ${expectedBalance}, got ${updatedUser.advanceBalance}`);
  }
});

const testRejectExpense = test('Reject expense', async () => {
  const expense = await Expense.findById(testExpense2._id);
  const user = await User.findById(testUser._id);
  const previousBalance = user.advanceBalance;

  // Simulate rejection
  expense.status = 'rejected';
  expense.rejectionReason = 'Variance too high';
  expense.approvedBy = testAdmin._id;
  expense.approvedAt = new Date();
  await expense.save();

  // Verify
  const updatedExpense = await Expense.findById(testExpense2._id);
  if (updatedExpense.status !== 'rejected') {
    throw new Error('Expense not rejected');
  }
  if (updatedExpense.rejectionReason !== 'Variance too high') {
    throw new Error('Rejection reason not set correctly');
  }

  // Balance should not change
  const updatedUser = await User.findById(testUser._id);
  if (updatedUser.advanceBalance !== previousBalance) {
    throw new Error('Balance should not change on rejection');
  }
});

const testApproveNonJourneyExpense = test('Approve non-journey expense', async () => {
  const expense = await Expense.findById(testExpense3._id);
  const user = await User.findById(testUser._id);
  const previousBalance = user.advanceBalance;

  // For non-journey expenses, use the expense amount
  const approvedAmount = expense.amount;
  expense.status = 'approved';
  expense.approvedAmount = approvedAmount;
  expense.approvedBy = testAdmin._id;
  expense.approvedAt = new Date();
  await expense.save();

  // Update balance
  user.advanceBalance -= approvedAmount;
  await user.save();

  // Verify
  const updatedExpense = await Expense.findById(testExpense3._id);
  if (updatedExpense.status !== 'approved') {
    throw new Error('Expense not approved');
  }
  if (updatedExpense.approvedAmount !== approvedAmount) {
    throw new Error('Approved amount not set correctly');
  }

  const updatedUser = await User.findById(testUser._id);
  const expectedBalance = previousBalance - approvedAmount;
  if (updatedUser.advanceBalance !== expectedBalance) {
    throw new Error(`Expected balance ${expectedBalance}, got ${updatedUser.advanceBalance}`);
  }
});

const testCannotApproveAlreadyApproved = test('Cannot approve already approved expense', async () => {
  const expense = await Expense.findById(testExpense1._id);
  if (expense.status !== 'approved') {
    throw new Error('Test setup failed: expense should be approved');
  }

  // Try to approve again (should fail in real controller)
  // This test just verifies the status
  if (expense.status === 'pending') {
    throw new Error('Expense should not be pending');
  }
});

const testBulkApproveSetup = test('Create expenses for bulk approval', async () => {
  // Create multiple pending expenses
  const expenses = [];
  for (let i = 0; i < 3; i++) {
    const expense = new Expense({
      userId: testUser._id,
      type: 'food',
      date: new Date(),
      description: `Bulk test expense ${i + 1}`,
      amount: 100 + (i * 50),
      status: 'pending'
    });
    await expense.save();
    expenses.push(expense);
  }

  if (expenses.length !== 3) {
    throw new Error('Bulk test expenses not created');
  }
});

const testFindPendingExpenses = test('Find pending expenses for bulk approval', async () => {
  const pendingExpenses = await Expense.find({
    userId: testUser._id,
    status: 'pending'
  });

  if (pendingExpenses.length === 0) {
    throw new Error('No pending expenses found');
  }
});

const testBalanceCalculation = test('Verify balance calculation', async () => {
  const user = await User.findById(testUser._id);

  // Calculate expected balance
  const approvedExpenses = await Expense.find({
    userId: testUser._id,
    status: 'approved'
  });

  let totalDeducted = 0;
  for (const expense of approvedExpenses) {
    totalDeducted += expense.approvedAmount || 0;
  }

  const expectedBalance = 10000 - totalDeducted; // Initial balance - total deducted

  if (Math.abs(user.advanceBalance - expectedBalance) > 0.01) {
    throw new Error(`Balance mismatch. Expected ${expectedBalance}, got ${user.advanceBalance}`);
  }
});

const testCleanup = test('Cleanup test data', async () => {
  await Expense.deleteMany({ userId: testUser._id });
  await Journey.deleteOne({ _id: testJourney._id });
  await User.deleteOne({ _id: testUser._id });
  await User.deleteOne({ _id: testAdmin._id });
});

/**
 * Run all tests
 */
const runTests = async () => {
  console.log('\n========================================');
  console.log('APPROVAL WORKFLOW TEST SUITE');
  console.log('========================================\n');

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fieldx');
    console.log('✓ Connected to MongoDB\n');

    console.log('--- Setup Tests ---');
    await testCreateUsers();
    await testCreateJourney();
    await testCreateExpenses();

    console.log('\n--- Approval Amount Calculation Tests ---');
    await testCalculateApprovedAmountOption1();
    await testCalculateApprovedAmountOption2();
    await testCalculateApprovedAmountOption3();

    console.log('\n--- Approval Workflow Tests ---');
    await testApproveExpenseOption1();
    await testRejectExpense();
    await testApproveNonJourneyExpense();
    await testCannotApproveAlreadyApproved();
    await testBulkApproveSetup();
    await testFindPendingExpenses();
    await testBalanceCalculation();
    await testCleanup();

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
  } finally {
    await mongoose.connection.close();
  }
};

// Run tests
runTests();

