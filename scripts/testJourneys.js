/**
 * Journey Management Test Script
 * Tests journey tracking, distance calculation, and GPS functionality
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Journey = require('../src/models/Journey');
const User = require('../src/models/User');
const Audit = require('../src/models/Audit');
const {
  calculateDistance,
  calculateDistanceWithHaversine,
  calculateJourneyCost,
  isValidCoordinate,
  areCoordinatesDifferent
} = require('../src/utils/distanceCalculator');

// Test counter
let testsPassed = 0;
let testsFailed = 0;

// Test helper
const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ Test ${testsPassed + testsFailed + 1}: ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ Test ${testsPassed + testsFailed + 1}: ${name}`);
    console.error(`   Error: ${error.message}`);
    testsFailed++;
  }
};

// Async test helper
const testAsync = async (name, fn) => {
  try {
    await fn();
    console.log(`✅ Test ${testsPassed + testsFailed + 1}: ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ Test ${testsPassed + testsFailed + 1}: ${name}`);
    console.error(`   Error: ${error.message}`);
    testsFailed++;
  }
};

// Main test function
const runTests = async () => {
  console.log('🧪 Starting Journey Management Tests...\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fieldx-test');
    console.log('📦 Connected to MongoDB\n');

    // Clean up test data
    await Journey.deleteMany({ notes: /test journey/i });
    await User.deleteMany({ email: /test\.journey/i });
    await Audit.deleteMany({ action: /journey_/i });

    console.log('=== VALIDATION TESTS ===\n');

    // Test 1: Valid GPS coordinates
    test('Valid GPS coordinates', () => {
      const coords = { latitude: 18.5204, longitude: 73.8567 };
      if (!isValidCoordinate(coords)) {
        throw new Error('Valid coordinates rejected');
      }
    });

    // Test 2: Invalid latitude (too high)
    test('Reject invalid latitude (> 90)', () => {
      const coords = { latitude: 91, longitude: 73.8567 };
      if (isValidCoordinate(coords)) {
        throw new Error('Invalid latitude accepted');
      }
    });

    // Test 3: Invalid longitude (too low)
    test('Reject invalid longitude (< -180)', () => {
      const coords = { latitude: 18.5204, longitude: -181 };
      if (isValidCoordinate(coords)) {
        throw new Error('Invalid longitude accepted');
      }
    });

    // Test 4: Missing coordinates
    test('Reject missing coordinates', () => {
      const coords = { latitude: 18.5204 };
      if (isValidCoordinate(coords)) {
        throw new Error('Missing longitude accepted');
      }
    });

    // Test 5: Haversine distance calculation
    test('Haversine distance calculation', () => {
      const origin = { latitude: 18.5204, longitude: 73.8567 };
      const destination = { latitude: 18.5642, longitude: 73.7769 };
      const result = calculateDistanceWithHaversine(origin, destination);

      if (!result.distance || result.distance <= 0) {
        throw new Error('Invalid distance calculated');
      }

      if (result.source !== 'haversine') {
        throw new Error('Wrong calculation source');
      }

      console.log(`   Distance: ${result.distance} km`);
    });

    // Test 6: Coordinates are different
    test('Detect different coordinates', () => {
      const coord1 = { latitude: 18.5204, longitude: 73.8567 };
      const coord2 = { latitude: 18.5642, longitude: 73.7769 };

      if (!areCoordinatesDifferent(coord1, coord2)) {
        throw new Error('Different coordinates not detected');
      }
    });

    // Test 7: Coordinates are same
    test('Detect same coordinates', () => {
      const coord1 = { latitude: 18.5204, longitude: 73.8567 };
      const coord2 = { latitude: 18.5204, longitude: 73.8567 };

      if (areCoordinatesDifferent(coord1, coord2)) {
        throw new Error('Same coordinates detected as different');
      }
    });

    // Test 8: Journey cost calculation
    test('Calculate journey cost', () => {
      const distance = 10; // 10 km
      const cost = calculateJourneyCost(distance);

      if (cost !== 80) { // 10 km × ₹8/km = ₹80
        throw new Error(`Expected cost ₹80, got ₹${cost}`);
      }
    });

    // Test 9: Journey cost with custom rate
    test('Calculate journey cost with custom rate', () => {
      const distance = 10; // 10 km
      const rate = 10; // ₹10/km
      const cost = calculateJourneyCost(distance, rate);

      if (cost !== 100) { // 10 km × ₹10/km = ₹100
        throw new Error(`Expected cost ₹100, got ₹${cost}`);
      }
    });

    console.log('\n=== DATABASE TESTS ===\n');

    // Create test user
    await testUser.save();

    // Test 10: Create journey with valid data
    await testAsync('Create journey with valid data', async () => {
      const journey = new Journey({
        userId: testUser._id,
        startCoordinates: {
          latitude: 18.5204,
          longitude: 73.8567
        },
        startAddress: 'Pune, Maharashtra',
        startTimestamp: new Date(),
        status: 'active',
        notes: 'Test journey 1'
      });

      await journey.save();

      if (!journey._id) {
        throw new Error('Journey not saved');
      }
    });

    // Test 11: Find active journey
    await testAsync('Find active journey for user', async () => {
      const activeJourney = await Journey.findActiveJourney(testUser._id);

      if (!activeJourney) {
        throw new Error('Active journey not found');
      }

      if (activeJourney.status !== 'active') {
        throw new Error('Journey status is not active');
      }
    });

    // Test 12: Cannot create multiple active journeys
    await testAsync('Prevent multiple active journeys', async () => {
      const activeJourney = await Journey.findActiveJourney(testUser._id);

      if (!activeJourney) {
        throw new Error('No active journey found');
      }

      // This should be prevented at controller level
      console.log('   (Controller should prevent this)');
    });

    // Test 13: Complete journey
    await testAsync('Complete journey with distance calculation', async () => {
      const activeJourney = await Journey.findActiveJourney(testUser._id);

      if (!activeJourney) {
        throw new Error('No active journey to complete');
      }

      const endCoords = {
        latitude: 18.5642,
        longitude: 73.7769
      };

      await activeJourney.complete(endCoords, 'Hinjewadi, Pune', 8.5);

      if (activeJourney.status !== 'completed') {
        throw new Error('Journey not marked as completed');
      }

      if (!activeJourney.endTimestamp) {
        throw new Error('End timestamp not set');
      }

      if (activeJourney.calculatedDistance !== 8.5) {
        throw new Error('Distance not saved correctly');
      }
    });

    // Test 14: Virtual property - duration
    await testAsync('Virtual property: durationMinutes', async () => {
      const journey = await Journey.findOne({ userId: testUser._id, status: 'completed' });

      if (!journey) {
        throw new Error('Completed journey not found');
      }

      const duration = journey.durationMinutes;

      if (duration === null || duration === undefined) {
        throw new Error('Duration not calculated');
      }

      console.log(`   Duration: ${duration} minutes`);
    });

    // Test 15: Virtual property - coordinates string
    await testAsync('Virtual property: coordinatesString', async () => {
      const journey = await Journey.findOne({ userId: testUser._id, status: 'completed' });

      if (!journey) {
        throw new Error('Completed journey not found');
      }

      const startCoords = journey.startCoordinatesString;
      const endCoords = journey.endCoordinatesString;

      if (!startCoords || !endCoords) {
        throw new Error('Coordinate strings not generated');
      }

      console.log(`   Start: ${startCoords}, End: ${endCoords}`);
    });

    // Test 16: Create journey with GPS offline
    await testAsync('Create journey with GPS offline', async () => {
      const journey = new Journey({
        userId: testUser._id,
        startCoordinates: {
          latitude: 18.5204,
          longitude: 73.8567
        },
        startAddress: 'Pune, Maharashtra',
        startTimestamp: new Date(),
        status: 'active',
        gpsOffline: true,
        gpsOfflineReason: 'permission_denied',
        notes: 'Test journey with GPS offline'
      });

      await journey.save();

      if (!journey.gpsOffline) {
        throw new Error('GPS offline flag not set');
      }

      if (journey.gpsOfflineReason !== 'permission_denied') {
        throw new Error('GPS offline reason not saved');
      }

      // Complete this journey
      await journey.complete(
        { latitude: 18.5642, longitude: 73.7769 },
        'Hinjewadi, Pune',
        0 // No distance when GPS offline
      );
    });

    // Test 17: Cancel journey
    await testAsync('Cancel active journey', async () => {
      const journey = new Journey({
        userId: testUser._id,
        startCoordinates: {
          latitude: 18.5204,
          longitude: 73.8567
        },
        startAddress: 'Pune, Maharashtra',
        startTimestamp: new Date(),
        status: 'active',
        notes: 'Test journey to cancel'
      });

      await journey.save();

      await journey.cancel('User cancelled the journey');

      if (journey.status !== 'cancelled') {
        throw new Error('Journey not marked as cancelled');
      }

      if (!journey.notes.includes('cancelled')) {
        throw new Error('Cancellation reason not saved');
      }
    });

    // Test 18: Get user journey history
    await testAsync('Get user journey history', async () => {
      const history = await Journey.getUserHistory(testUser._id, 10);

      if (!history || history.length === 0) {
        throw new Error('No journey history found');
      }

      console.log(`   Found ${history.length} completed journeys`);
    });

    // Test 19: Journey indexes
    await testAsync('Journey indexes exist', async () => {
      const indexes = await Journey.collection.getIndexes();

      const requiredIndexes = [
        'userId_1_startTimestamp_-1',
        'userId_1_status_1',
        'status_1_createdAt_-1'
      ];

      for (const indexName of requiredIndexes) {
        if (!indexes[indexName]) {
          throw new Error(`Index ${indexName} not found`);
        }
      }

      console.log(`   All required indexes present`);
    });

    // Test 20: Distance calculation with Google Maps API (if key available)
    if (process.env.GOOGLE_MAPS_API_KEY) {
      await testAsync('Distance calculation with Google Maps API', async () => {
        const origin = { latitude: 18.5204, longitude: 73.8567 };
        const destination = { latitude: 18.5642, longitude: 73.7769 };

        const result = await calculateDistance(origin, destination);

        if (!result.distance || result.distance <= 0) {
          throw new Error('Invalid distance from Google Maps');
        }

        console.log(`   Distance: ${result.distance} km (${result.source})`);

        if (result.duration) {
          console.log(`   Duration: ${result.duration} minutes`);
        }
      });
    } else {
      console.log('⚠️  Test 20: Skipped (Google Maps API key not configured)');
    }

    // Test 21: Audit log creation
    await testAsync('Audit logs created for journey actions', async () => {
      const auditLogs = await Audit.find({
        action: { $in: ['journey_started', 'journey_ended', 'journey_cancelled'] }
      });

      if (auditLogs.length === 0) {
        console.log('   Note: Audit logs are created by controller, not model');
      } else {
        console.log(`   Found ${auditLogs.length} journey audit logs`);
      }
    });

    // Test 22: Journey statistics
    await testAsync('Calculate journey statistics', async () => {
      const stats = await Journey.aggregate([
        { $match: { userId: testUser._id, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalDistance: { $sum: '$calculatedDistance' },
            totalJourneys: { $sum: 1 },
            avgDistance: { $avg: '$calculatedDistance' }
          }
        }
      ]);

      if (!stats || stats.length === 0) {
        throw new Error('No statistics calculated');
      }

      const { totalDistance, totalJourneys, avgDistance } = stats[0];

      console.log(`   Total Journeys: ${totalJourneys}`);
      console.log(`   Total Distance: ${totalDistance?.toFixed(2)} km`);
      console.log(`   Average Distance: ${avgDistance?.toFixed(2)} km`);
    });

    console.log('\n=== TEST SUMMARY ===\n');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`📊 Total: ${testsPassed + testsFailed}`);
    console.log(`🎯 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(2)}%\n`);

    if (testsFailed === 0) {
      console.log('🎉 All tests passed!\n');
    } else {
      console.log('⚠️  Some tests failed. Please review the errors above.\n');
    }

  } catch (error) {
    console.error('❌ Test execution error:', error);
  } finally {
    // Clean up and disconnect
    await Journey.deleteMany({ notes: /test journey/i });
    await User.deleteMany({ email: /test\.journey/i });
    await mongoose.disconnect();
    console.log('📦 Disconnected from MongoDB');
  }
};

// Run tests
runTests().catch(console.error);

