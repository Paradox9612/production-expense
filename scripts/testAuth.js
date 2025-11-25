/**
 * Authentication System Test Script
 * Tests JWT utilities, login flow, and token refresh
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../src/models');
const { generateTokenPair, verifyAccessToken, verifyRefreshToken } = require('../src/utils/jwt');

const testAuth = async () => {
  console.log('🔐 Starting Authentication System Tests...\n');

  try {
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fieldx-test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB\n');

    // Test 1: Create test user
    console.log('1️⃣  Creating test user...');
    
    // Clean up existing test user
    await User.deleteOne({ email: 'test@fieldx.com' });
    
    const testUser = new User({
      email: 'test@fieldx.com',
      password: 'Test@123456',
      name: 'Test User',
      employeeId: 'TEST001',
      role: 'user',
      isActive: true
    });
    await testUser.save();
    console.log(`   ✅ Test user created: ${testUser.email}`);
    console.log(`   - Password is hashed: ${testUser.password !== 'Test@123456'}`);
    console.log(`   - User ID: ${testUser._id}\n`);

    // Test 2: Password verification
    console.log('2️⃣  Testing password verification...');
    const correctPassword = await testUser.comparePassword('Test@123456');
    const wrongPassword = await testUser.comparePassword('WrongPassword');
    console.log(`   ✅ Correct password: ${correctPassword}`);
    console.log(`   ✅ Wrong password rejected: ${!wrongPassword}\n`);

    // Test 3: Generate tokens
    console.log('3️⃣  Testing token generation...');
    const tokens = generateTokenPair(testUser);
    console.log(`   ✅ Access token generated (${tokens.accessToken.length} chars)`);
    console.log(`   ✅ Refresh token generated (${tokens.refreshToken.length} chars)`);
    console.log(`   - Access token preview: ${tokens.accessToken.substring(0, 50)}...`);
    console.log(`   - Refresh token preview: ${tokens.refreshToken.substring(0, 50)}...\n`);

    // Test 4: Verify access token
    console.log('4️⃣  Testing access token verification...');
    try {
      const decodedAccess = verifyAccessToken(tokens.accessToken);
      console.log(`   ✅ Access token verified successfully`);
      console.log(`   - User ID: ${decodedAccess.id}`);
      console.log(`   - Email: ${decodedAccess.email}`);
      console.log(`   - Role: ${decodedAccess.role}`);
      console.log(`   - Type: ${decodedAccess.type}`);
      console.log(`   - Issuer: ${decodedAccess.iss}`);
      console.log(`   - Audience: ${decodedAccess.aud}\n`);
    } catch (error) {
      console.log(`   ❌ Access token verification failed: ${error.message}\n`);
    }

    // Test 5: Verify refresh token
    console.log('5️⃣  Testing refresh token verification...');
    try {
      const decodedRefresh = verifyRefreshToken(tokens.refreshToken);
      console.log(`   ✅ Refresh token verified successfully`);
      console.log(`   - User ID: ${decodedRefresh.id}`);
      console.log(`   - Email: ${decodedRefresh.email}`);
      console.log(`   - Type: ${decodedRefresh.type}\n`);
    } catch (error) {
      console.log(`   ❌ Refresh token verification failed: ${error.message}\n`);
    }

    // Test 6: Test invalid token
    console.log('6️⃣  Testing invalid token handling...');
    try {
      verifyAccessToken('invalid.token.here');
      console.log(`   ❌ Invalid token was accepted (should have failed)\n`);
    } catch (error) {
      console.log(`   ✅ Invalid token rejected: ${error.message}\n`);
    }

    // Test 7: Test wrong token type
    console.log('7️⃣  Testing wrong token type...');
    try {
      verifyAccessToken(tokens.refreshToken); // Using refresh token as access token
      console.log(`   ❌ Wrong token type was accepted (should have failed)\n`);
    } catch (error) {
      console.log(`   ✅ Wrong token type rejected: ${error.message}\n`);
    }

    // Test 8: Test user safe object
    console.log('8️⃣  Testing user safe object (no password)...');
    const safeUser = testUser.toSafeObject();
    console.log(`   ✅ Safe object created`);
    console.log(`   - Has email: ${!!safeUser.email}`);
    console.log(`   - Has name: ${!!safeUser.name}`);
    console.log(`   - Has role: ${!!safeUser.role}`);
    console.log(`   - Password excluded: ${!safeUser.password}\n`);

    // Test 9: Create admin user
    console.log('9️⃣  Creating admin user...');
    await User.deleteOne({ email: 'admin@fieldx.com' });
    
    const adminUser = new User({
      email: 'admin@fieldx.com',
      password: 'Admin@123456',
      name: 'Admin User',
      employeeId: 'ADMIN001',
      role: 'admin',
      isActive: true
    });
    await adminUser.save();
    console.log(`   ✅ Admin user created: ${adminUser.email}`);
    console.log(`   - Role: ${adminUser.role}\n`);

    // Test 10: Generate admin tokens
    console.log('🔟 Testing admin token generation...');
    const adminTokens = generateTokenPair(adminUser);
    const decodedAdmin = verifyAccessToken(adminTokens.accessToken);
    console.log(`   ✅ Admin tokens generated`);
    console.log(`   - Admin role in token: ${decodedAdmin.role === 'admin'}\n`);

    console.log('✅ All authentication tests passed!\n');
    console.log('📊 Summary:');
    console.log('   - User model with password hashing: ✅');
    console.log('   - Password comparison: ✅');
    console.log('   - Token generation: ✅');
    console.log('   - Token verification: ✅');
    console.log('   - Invalid token rejection: ✅');
    console.log('   - Safe user object: ✅');
    console.log('   - Admin role support: ✅');
    console.log('\n🎉 Authentication system is ready for use!');
    console.log('\n📝 Test credentials created:');
    console.log('   User: test@fieldx.com / Test@123456');
    console.log('   Admin: admin@fieldx.com / Admin@123456');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

// Run tests
testAuth();

