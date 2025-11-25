/**
 * Expense Management Test Script
 * Tests expense CRUD operations, filtering, and variance calculation
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Expense = require('../src/models/Expense');
const User = require('../src/models/User');
const Journey = require('../src/models/Journey');
const { calculateVariance, calculateVarianceWithCategory } = require('../src/utils/varianceCalculator');

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
 * Variance Calculation Tests
 */
const testVarianceCalculation = test('Variance calculation - basic', async () => {
  const variance = calculateVariance(100, 120);
  if (variance !== 20) {
    throw new Error(`Expected 20, got ${variance}`);
  }
});

const testVarianceCalculationReverse = test('Variance calculation - reverse', async () => {
  const variance = calculateVariance(120, 100);
  if (variance !== 16.67) {
    throw new Error(`Expected 16.67, got ${variance}`);
  }
});

const testVarianceCalculationZero = test('Variance calculation - zero system distance', async () => {
  const variance = calculateVariance(0, 100);
  if (variance !== 0) {
    throw new Error(`Expected 0, got ${variance}`);
  }
});

const testVarianceCategory = test('Variance category - low', async () => {
  const result = calculateVarianceWithCategory(100, 105);
  if (result.category !== 'low') {
    throw new Error(`Expected 'low', got ${result.category}`);
  }
});

const testVarianceCategoryMedium = test('Variance category - medium', async () => {
  const result = calculateVarianceWithCategory(100, 115);
  if (result.category !== 'medium') {
    throw new Error(`Expected 'medium', got ${result.category}`);
  }
});

const testVarianceCategoryHigh = test('Variance category - high', async () => {
  const result = calculateVarianceWithCategory(100, 125);
  if (result.category !== 'high') {
    throw new Error(`Expected 'high', got ${result.category}`);
  }
});

/**
 * Database Tests
 */
let testUser;
let testJourney;
let testExpense;

const testCreateUser = test('Create test user', async () => {
  testUser = new User({
    name: 'Test User',
    email: `test.expense.${Date.now()}@example.com`,
    password: 'password123',
    employeeId: `EMP${Date.now()}`,
    role: 'employee',
    advanceBalance: 10000
  });
  await testUser.save();
  if (!testUser._id) {
    throw new Error('User not created');
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

const testCreateJourneyExpense = test('Create journey expense', async () => {
  testExpense = new Expense({
    userId: testUser._id,
    journeyId: testJourney._id,
    type: 'journey',
    date: new Date(),
    description: 'Client meeting travel',
    amount: 124,
    startCoordinates: testJourney.startCoordinates,
    endCoordinates: testJourney.endCoordinates,
    startAddress: testJourney.startAddress,
    endAddress: testJourney.endAddress,
    systemDistance: 15.5,
    manualDistance: 18.0,
    gpsOffline: false,
    distanceRate: 8,
    status: 'pending'
  });
  await testExpense.save();
  if (!testExpense._id) {
    throw new Error('Expense not created');
  }
});

const testExpenseVarianceVirtual = test('Expense variance virtual property', async () => {
  const expense = await Expense.findById(testExpense._id);
  const variance = expense.variancePercentage;
  const expectedVariance = calculateVariance(15.5, 18.0);
  if (Math.abs(variance - expectedVariance) > 0.01) {
    throw new Error(`Expected ${expectedVariance}, got ${variance}`);
  }
});

const testExpenseVarianceCategory = test('Expense variance category virtual', async () => {
  const expense = await Expense.findById(testExpense._id);
  const category = expense.varianceCategory;
  if (category !== 'medium') {
    throw new Error(`Expected 'medium', got ${category}`);
  }
});

const testCreateNonJourneyExpense = test('Create non-journey expense', async () => {
  const foodExpense = new Expense({
    userId: testUser._id,
    type: 'food',
    date: new Date(),
    description: 'Team lunch',
    amount: 500,
    status: 'pending',
    attachments: []
  });
  await foodExpense.save();
  if (!foodExpense._id) {
    throw new Error('Food expense not created');
  }
});

const testUpdateExpense = test('Update pending expense', async () => {
  const expense = await Expense.findById(testExpense._id);
  expense.description = 'Updated: Client meeting travel';
  expense.manualDistance = 17.0;
  await expense.save();

  const updated = await Expense.findById(testExpense._id);
  if (updated.description !== 'Updated: Client meeting travel') {
    throw new Error('Description not updated');
  }
  if (updated.manualDistance !== 17.0) {
    throw new Error('Manual distance not updated');
  }
});

const testExpenseWithAttachments = test('Create expense with attachments', async () => {
  const expense = new Expense({
    userId: testUser._id,
    type: 'accessories',
    date: new Date(),
    description: 'Office supplies',
    amount: 250,
    status: 'pending',
    attachments: [
      {
        url: 'https://example.com/receipt1.jpg',
        filename: 'receipt1.jpg',
        fileType: 'image/jpeg',
        fileSize: 102400
      },
      {
        url: 'https://example.com/receipt2.pdf',
        filename: 'receipt2.pdf',
        fileType: 'application/pdf',
        fileSize: 204800
      }
    ]
  });
  await expense.save();
  if (expense.attachments.length !== 2) {
    throw new Error('Attachments not saved correctly');
  }
});

const testFindExpensesByUser = test('Find expenses by user', async () => {
  const expenses = await Expense.find({ userId: testUser._id });
  if (expenses.length < 3) {
    throw new Error(`Expected at least 3 expenses, found ${expenses.length}`);
  }
});

const testFindExpensesByType = test('Find expenses by type', async () => {
  const journeyExpenses = await Expense.find({ type: 'journey' });
  if (journeyExpenses.length === 0) {
    throw new Error('No journey expenses found');
  }
});

const testFindExpensesByStatus = test('Find expenses by status', async () => {
  const pendingExpenses = await Expense.find({ status: 'pending' });
  if (pendingExpenses.length === 0) {
    throw new Error('No pending expenses found');
  }
});

const testFindExpensesByDateRange = test('Find expenses by date range', async () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const expenses = await Expense.find({
    date: { $gte: yesterday, $lte: tomorrow }
  });
  if (expenses.length === 0) {
    throw new Error('No expenses found in date range');
  }
});

const testExpenseIndexes = test('Verify expense indexes', async () => {
  const indexes = await Expense.collection.getIndexes();
  const indexNames = Object.keys(indexes);

  const requiredIndexes = ['userId_1', 'date_1', 'type_1', 'status_1'];
  for (const indexName of requiredIndexes) {
    if (!indexNames.some(name => name.includes(indexName.split('_')[0]))) {
      throw new Error(`Missing index: ${indexName}`);
    }
  }
});

const testExpenseStatistics = test('Calculate expense statistics', async () => {
  const stats = await Expense.aggregate([
    { $match: { userId: testUser._id } },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalExpenses: { $sum: 1 },
        avgAmount: { $avg: '$amount' }
      }
    }
  ]);

  if (!stats[0] || stats[0].totalExpenses === 0) {
    throw new Error('Statistics calculation failed');
  }
});

const testCleanup = test('Cleanup test data', async () => {
  await Expense.deleteMany({ userId: testUser._id });
  await Journey.deleteOne({ _id: testJourney._id });
  await User.deleteOne({ _id: testUser._id });
});

/**
 * Run all tests
 */
const runTests = async () => {
  console.log('\n========================================');
  console.log('EXPENSE MANAGEMENT TEST SUITE');
  console.log('========================================\n');

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fieldx');
    console.log('✓ Connected to MongoDB\n');

    console.log('--- Variance Calculation Tests ---');
    await testVarianceCalculation();
    await testVarianceCalculationReverse();
    await testVarianceCalculationZero();
    await testVarianceCategory();
    await testVarianceCategoryMedium();
    await testVarianceCategoryHigh();

    console.log('\n--- Database Tests ---');
    await testCreateUser();
    await testCreateJourney();
    await testCreateJourneyExpense();
    await testExpenseVarianceVirtual();
    await testExpenseVarianceCategory();
    await testCreateNonJourneyExpense();
    await testUpdateExpense();
    await testExpenseWithAttachments();
    await testFindExpensesByUser();
    await testFindExpensesByType();
    await testFindExpensesByStatus();
    await testFindExpensesByDateRange();
    await testExpenseIndexes();
    await testExpenseStatistics();
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

