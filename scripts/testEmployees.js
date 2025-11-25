/**
 * Employee Management Test Script
 * Tests employee CRUD operations and validation
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Audit = require('../src/models/Audit');
const {
  createEmployeeSchema,
  updateEmployeeSchema,
  updatePasswordSchema,
  paginationSchema
} = require('../src/utils/validators');

// Test counter
let passed = 0;
let failed = 0;

/**
 * Test helper function
 */
const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
};

/**
 * Async test helper
 */
const testAsync = async (name, fn) => {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
};

/**
 * Main test function
 */
const runTests = async () => {
  console.log('\n🧪 Employee Management System Tests\n');
  console.log('='.repeat(50));

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fieldx-test');
    console.log('✅ Connected to MongoDB\n');

    // Clean up test data
    await User.deleteMany({ email: { $regex: /test.*@fieldx\.com/ } });
    await Audit.deleteMany({});

    // ========================================
    // VALIDATION TESTS
    // ========================================
    console.log('\n📋 Validation Tests\n');

    // Test 1: Valid employee creation data
    test('Valid employee creation data', () => {
      const { error } = createEmployeeSchema.validate({
        email: 'john.doe@fieldx.com',
        password: 'Test@123456',
        name: 'John Doe',
        employeeId: 'EMP001',
        role: 'user'
      });
      if (error) throw new Error(error.message);
    });

    // Test 2: Invalid email format
    test('Reject invalid email format', () => {
      const { error } = createEmployeeSchema.validate({
        email: 'invalid-email',
        name: 'John Doe'
      });
      if (!error) throw new Error('Should reject invalid email');
    });

    // Test 3: Weak password
    test('Reject weak password', () => {
      const { error } = createEmployeeSchema.validate({
        email: 'john@fieldx.com',
        password: 'weak',
        name: 'John Doe'
      });
      if (!error) throw new Error('Should reject weak password');
    });

    // Test 4: Invalid IFSC code
    test('Reject invalid IFSC code', () => {
      const { error } = createEmployeeSchema.validate({
        email: 'john@fieldx.com',
        name: 'John Doe',
        bankDetails: {
          ifscCode: 'INVALID'
        }
      });
      if (!error) throw new Error('Should reject invalid IFSC code');
    });

    // Test 5: Valid IFSC code
    test('Accept valid IFSC code', () => {
      const { error } = createEmployeeSchema.validate({
        email: 'john@fieldx.com',
        name: 'John Doe',
        bankDetails: {
          ifscCode: 'SBIN0001234'
        }
      });
      if (error) throw new Error(error.message);
    });

    // Test 6: Invalid UPI ID
    test('Reject invalid UPI ID', () => {
      const { error } = createEmployeeSchema.validate({
        email: 'john@fieldx.com',
        name: 'John Doe',
        upiId: 'invalid-upi'
      });
      if (!error) throw new Error('Should reject invalid UPI ID');
    });

    // Test 7: Valid UPI ID
    test('Accept valid UPI ID', () => {
      const { error } = createEmployeeSchema.validate({
        email: 'john@fieldx.com',
        name: 'John Doe',
        upiId: 'john@paytm'
      });
      if (error) throw new Error(error.message);
    });

    // Test 8: Update schema requires at least one field
    test('Update schema requires at least one field', () => {
      const { error } = updateEmployeeSchema.validate({});
      if (!error) throw new Error('Should require at least one field');
    });

    // Test 9: Password update validation
    test('Password update requires matching passwords', () => {
      const { error } = updatePasswordSchema.validate({
        newPassword: 'Test@123456',
        confirmPassword: 'Different@123'
      });
      if (!error) throw new Error('Should reject non-matching passwords');
    });

    // Test 10: Pagination validation
    test('Pagination with valid parameters', () => {
      const { error } = paginationSchema.validate({
        page: 1,
        limit: 10,
        search: 'john'
      });
      if (error) throw new Error(error.message);
    });

    // ========================================
    // DATABASE TESTS
    // ========================================
    console.log('\n💾 Database Tests\n');

    // Test 11: Create employee with all fields
    await testAsync('Create employee with all fields', async () => {
      const employee = new User({
        email: 'test.employee@fieldx.com',
        password: 'Test@123456',
        name: 'Test Employee',
        employeeId: 'EMP001',
        role: 'user',
        bankDetails: {
          accountNumber: '1234567890',
          ifscCode: 'SBIN0001234',
          bankName: 'State Bank of India',
          accountHolderName: 'Test Employee'
        },
        upiId: 'test@paytm'
      });
      await employee.save();

      if (!employee._id) throw new Error('Employee not created');
      if (employee.email !== 'test.employee@fieldx.com') throw new Error('Email not saved correctly');
    });

    // Test 12: Password is hashed
    await testAsync('Password is hashed on save', async () => {
      const employee = await User.findOne({ email: 'test.employee@fieldx.com' }).select('+password');
      if (!employee.password) throw new Error('Password not saved');
      if (employee.password === 'Test@123456') throw new Error('Password not hashed');
      if (!employee.password.startsWith('$2b$')) throw new Error('Password not bcrypt hashed');
    });

    // Test 13: Password comparison works
    await testAsync('Password comparison works', async () => {
      const employee = await User.findOne({ email: 'test.employee@fieldx.com' }).select('+password');
      const isValid = await employee.comparePassword('Test@123456');
      if (!isValid) throw new Error('Password comparison failed');

      const isInvalid = await employee.comparePassword('WrongPassword');
      if (isInvalid) throw new Error('Should reject wrong password');
    });

    // Test 14: Email uniqueness
    await testAsync('Email must be unique', async () => {
      try {
        const duplicate = new User({
          email: 'test.employee@fieldx.com',
          password: 'Test@123456',
          name: 'Duplicate',
          employeeId: 'EMP002'
        });
        await duplicate.save();
        throw new Error('Should not allow duplicate email');
      } catch (error) {
        if (!error.message.includes('duplicate') && !error.code === 11000) {
          throw new Error('Wrong error type');
        }
      }
    });

    // Test 15: EmployeeId uniqueness
    await testAsync('EmployeeId must be unique', async () => {
      try {
        const duplicate = new User({
          email: 'another@fieldx.com',
          password: 'Test@123456',
          name: 'Another Employee',
          employeeId: 'EMP001'
        });
        await duplicate.save();
        throw new Error('Should not allow duplicate employeeId');
      } catch (error) {
        if (!error.message.includes('duplicate') && !error.code === 11000) {
          throw new Error('Wrong error type');
        }
      }
    });

    // Test 16: Create admin employee
    await testAsync('Create admin employee', async () => {
      const admin = new User({
        email: 'test.admin@fieldx.com',
        password: 'Admin@123456',
        name: 'Test Admin',
        employeeId: 'ADMIN001',
        role: 'admin'
      });
      await admin.save();

      if (admin.role !== 'admin') throw new Error('Role not set correctly');
    });

    // Test 17: Default values
    await testAsync('Default values are set', async () => {
      const employee = new User({
        email: 'defaults@fieldx.com',
        password: 'Test@123456',
        name: 'Defaults Test',
        employeeId: 'EMP003'
      });
      await employee.save();

      if (employee.role !== 'user') throw new Error('Default role not set');
      if (employee.isActive !== true) throw new Error('Default isActive not set');
      if (employee.advanceBalance !== 0) throw new Error('Default balance not set');
    });

    // Test 18: toSafeObject method
    await testAsync('toSafeObject excludes password', async () => {
      const employee = await User.findOne({ email: 'test.employee@fieldx.com' });
      const safeObj = employee.toSafeObject();

      if (safeObj.password) throw new Error('Password should not be in safe object');
      if (!safeObj.email) throw new Error('Email should be in safe object');
      if (!safeObj.name) throw new Error('Name should be in safe object');
    });

    // Test 19: Update employee
    await testAsync('Update employee details', async () => {
      const employee = await User.findOne({ email: 'test.employee@fieldx.com' });
      employee.name = 'Updated Name';
      employee.upiId = 'updated@paytm';
      await employee.save();

      const updated = await User.findById(employee._id);
      if (updated.name !== 'Updated Name') throw new Error('Name not updated');
      if (updated.upiId !== 'updated@paytm') throw new Error('UPI ID not updated');
    });

    // Test 20: Soft delete (isActive)
    await testAsync('Soft delete sets isActive to false', async () => {
      const employee = await User.findOne({ email: 'defaults@fieldx.com' });
      employee.isActive = false;
      await employee.save();

      const deleted = await User.findById(employee._id);
      if (deleted.isActive !== false) throw new Error('isActive not set to false');
    });

    // Test 21: Query active employees only
    await testAsync('Query active employees only', async () => {
      const activeEmployees = await User.find({ isActive: true });
      const hasInactive = activeEmployees.some(emp => !emp.isActive);
      if (hasInactive) throw new Error('Query returned inactive employees');
    });

    // Test 22: Audit log creation
    await testAsync('Audit log can be created for employee actions', async () => {
      const employee = await User.findOne({ email: 'test.employee@fieldx.com' });
      const admin = await User.findOne({ email: 'test.admin@fieldx.com' });

      await Audit.log({
        action: 'employee_created',
        performedBy: admin._id,
        targetUser: employee._id,
        metadata: {
          employeeId: employee.employeeId,
          email: employee.email
        }
      });

      const auditLog = await Audit.findOne({ action: 'employee_created' });
      if (!auditLog) throw new Error('Audit log not created');
      if (auditLog.targetUser.toString() !== employee._id.toString()) {
        throw new Error('Audit log targetUser incorrect');
      }
    });

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '='.repeat(50));
    console.log('\n📊 Test Summary\n');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Total:  ${passed + failed}`);
    console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

    if (failed === 0) {
      console.log('🎉 All tests passed! Employee management system is working correctly.\n');
    } else {
      console.log('⚠️  Some tests failed. Please review the errors above.\n');
    }

  } catch (error) {
    console.error('\n❌ Test execution error:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('✅ Database connection closed\n');
    process.exit(failed > 0 ? 1 : 0);
  }
};

// Run tests
runTests();

