/**
 * Seed Script - Create Default Users with RBAC
 * Creates superadmin, admin, and user accounts with proper role hierarchy and assignments
 *
 * RBAC Structure:
 * - Super Admin: Full system access, manages all admins and users
 * - Admin (Manager): Limited to assigned users only
 * - User (Field Agent): Own data only
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../src/models/User');
const Expense = require('../src/models/Expense');
const Journey = require('../src/models/Journey');
const Settings = require('../src/models/Settings');

// Default users configuration with RBAC
const defaultUsers = [
  {
    name: 'Super Admin',
    email: 'superadmin@fieldx.com',
    password: 'Superadmin@001',
    employeeId: 'SA001',
    role: 'superadmin',
    isActive: true,
    advanceBalance: 0,
    assignedTo: null // Super admin is not assigned to anyone
  },
  {
    name: 'Admin Manager 1',
    email: 'admin1@fieldx.com',
    password: 'Admin@001',
    employeeId: 'AD001',
    role: 'admin',
    isActive: true,
    advanceBalance: 0,
    assignedTo: null // Admins are not assigned to anyone
  },
  {
    name: 'Admin Manager 2',
    email: 'admin2@fieldx.com',
    password: 'Admin@002',
    employeeId: 'AD002',
    role: 'admin',
    isActive: true,
    advanceBalance: 0,
    assignedTo: null
  },
  {
    name: 'Field Agent 1',
    email: 'user1@fieldx.com',
    password: 'User@001',
    employeeId: 'FA001',
    role: 'user',
    isActive: true,
    advanceBalance: 5000,
    assignedTo: 'admin1@fieldx.com' // Will be replaced with admin1's ObjectId
  },
  {
    name: 'Field Agent 2',
    email: 'user2@fieldx.com',
    password: 'User@002',
    employeeId: 'FA002',
    role: 'user',
    isActive: true,
    advanceBalance: 3000,
    assignedTo: 'admin1@fieldx.com' // Assigned to Admin Manager 1
  },
  {
    name: 'Field Agent 3',
    email: 'user3@fieldx.com',
    password: 'User@003',
    employeeId: 'FA003',
    role: 'user',
    isActive: true,
    advanceBalance: 2000,
    assignedTo: 'admin2@fieldx.com' // Assigned to Admin Manager 2
  }
];

// Sample expenses for testing approvals
const sampleExpenses = [
  // Pending journey expenses
  {
    userId: null, // Will be set to user._id
    date: new Date('2025-11-15'),
    type: 'journey',
    description: 'Client visit - Mumbai to Pune',
    amount: 800,
    startCoordinates: { latitude: 19.0760, longitude: 72.8777 },
    endCoordinates: { latitude: 18.5204, longitude: 73.8567 },
    startAddress: 'Mumbai, Maharashtra',
    endAddress: 'Pune, Maharashtra',
    systemDistance: 150,
    manualDistance: 160,
    distanceRate: 8,
    gpsOffline: false,
    status: 'pending'
  },
  {
    userId: null,
    date: new Date('2025-11-14'),
    type: 'journey',
    description: 'Site inspection - Delhi to Gurgaon',
    amount: 240,
    startCoordinates: { latitude: 28.7041, longitude: 77.1025 },
    endCoordinates: { latitude: 28.4595, longitude: 77.0266 },
    startAddress: 'Delhi',
    endAddress: 'Gurgaon, Haryana',
    systemDistance: 30,
    manualDistance: 35,
    distanceRate: 8,
    gpsOffline: false,
    status: 'pending'
  },
  // Pending non-journey expenses
  {
    userId: null,
    date: new Date('2025-11-13'),
    type: 'food',
    description: 'Client lunch meeting',
    amount: 1200,
    status: 'pending'
  },
  {
    userId: null,
    date: new Date('2025-11-12'),
    type: 'accessories',
    description: 'Mobile phone charger for work',
    amount: 800,
    status: 'pending'
  },
  {
    userId: null,
    date: new Date('2025-11-11'),
    type: 'other',
    description: 'Parking fees for client meeting',
    amount: 200,
    status: 'pending'
  },
  // Approved expenses
  {
    userId: null,
    date: new Date('2025-11-10'),
    type: 'journey',
    description: 'Office to airport',
    amount: 640,
    startCoordinates: { latitude: 18.5204, longitude: 73.8567 },
    endCoordinates: { latitude: 18.5778, longitude: 73.9850 },
    startAddress: 'Pune',
    endAddress: 'Pune Airport',
    systemDistance: 25,
    manualDistance: 25,
    distanceRate: 8,
    status: 'approved',
    approvedOption: 1,
    approvedAmount: 640,
    approvedBy: null, // Will be set to admin._id
    approvedAt: new Date('2025-11-10T14:30:00'),
    adminNotes: 'Approved - exact distance match'
  },
  {
    userId: null,
    date: new Date('2025-11-09'),
    type: 'food',
    description: 'Team dinner',
    amount: 2500,
    status: 'approved',
    approvedAmount: 2500,
    approvedBy: null,
    approvedAt: new Date('2025-11-09T16:00:00'),
    adminNotes: 'Approved - business expense'
  },
  // Rejected expense
  {
    userId: null,
    date: new Date('2025-11-08'),
    type: 'other',
    description: 'Personal shopping',
    amount: 5000,
    status: 'rejected',
    rejectionReason: 'Not a business expense',
    approvedBy: null,
    approvedAt: new Date('2025-11-08T10:15:00')
  }
];

/**
 * Connect to MongoDB
 */
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

/**
 * Create default users with RBAC hierarchy
 */
async function seedUsers() {
  try {
    console.log('\n🌱 Starting RBAC seed process...\n');

    // First pass: Create superadmin and admins (no assignedTo dependencies)
    const createdUsers = {};

    for (const userData of defaultUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });

      if (existingUser) {
        console.log(`⚠️  User already exists: ${userData.email} (${userData.role})`);
        createdUsers[userData.email] = existingUser;
        continue;
      }

      // For first pass, only create superadmin and admins
      if (userData.role === 'superadmin' || userData.role === 'admin') {
        const user = new User({
          ...userData,
          assignedTo: null // Superadmin and admins are not assigned to anyone
        });

        await user.save();
        createdUsers[userData.email] = user;
        console.log(`✅ Created ${userData.role}: ${userData.email}`);
        console.log(`   Password: ${userData.password}`);
      }
    }

    // Second pass: Create users with assignedTo references
    for (const userData of defaultUsers) {
      if (userData.role === 'user') {
        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });

        if (existingUser) {
          console.log(`⚠️  User already exists: ${userData.email} (${userData.role})`);
          continue;
        }

        // Resolve assignedTo email to ObjectId
        let assignedToId = null;
        if (userData.assignedTo) {
          const assignedAdmin = createdUsers[userData.assignedTo];
          if (assignedAdmin) {
            assignedToId = assignedAdmin._id;
          } else {
            console.log(`⚠️  Warning: Admin ${userData.assignedTo} not found for user ${userData.email}`);
          }
        }

        const user = new User({
          ...userData,
          assignedTo: assignedToId
        });

        await user.save();
        createdUsers[userData.email] = user;
        console.log(`✅ Created user: ${userData.email}`);
        console.log(`   Password: ${userData.password}`);
        console.log(`   Assigned to: ${userData.assignedTo || 'None'}`);
      }
    }

    console.log('\n🎉 RBAC seed process completed!\n');
    console.log('Default Users Created with RBAC:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. Super Admin:');
    console.log('   Email: superadmin@fieldx.com');
    console.log('   Employee ID: SA001');
    console.log('   Password: Superadmin@001');
    console.log('   Role: superadmin');
    console.log('   Access: Full system access');
    console.log('');
    console.log('2. Admin Manager 1:');
    console.log('   Email: admin1@fieldx.com');
    console.log('   Employee ID: AD001');
    console.log('   Password: Admin@001');
    console.log('   Role: admin');
    console.log('   Manages: Field Agent 1, Field Agent 2');
    console.log('');
    console.log('3. Admin Manager 2:');
    console.log('   Email: admin2@fieldx.com');
    console.log('   Employee ID: AD002');
    console.log('   Password: Admin@002');
    console.log('   Role: admin');
    console.log('   Manages: Field Agent 3');
    console.log('');
    console.log('4. Field Agent 1:');
    console.log('   Email: user1@fieldx.com');
    console.log('   Employee ID: FA001');
    console.log('   Password: User@001');
    console.log('   Role: user');
    console.log('   Assigned to: Admin Manager 1');
    console.log('   Advance Balance: ₹5000');
    console.log('');
    console.log('5. Field Agent 2:');
    console.log('   Email: user2@fieldx.com');
    console.log('   Employee ID: FA002');
    console.log('   Password: User@002');
    console.log('   Role: user');
    console.log('   Assigned to: Admin Manager 1');
    console.log('   Advance Balance: ₹3000');
    console.log('');
    console.log('6. Field Agent 3:');
    console.log('   Email: user3@fieldx.com');
    console.log('   Employee ID: FA003');
    console.log('   Password: User@003');
    console.log('   Role: user');
    console.log('   Assigned to: Admin Manager 2');
    console.log('   Advance Balance: ₹2000');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n⚠️  IMPORTANT: Change these passwords in production!\n');

  } catch (error) {
    console.error('❌ Seed error:', error.message);
    throw error;
  }
}

/**
 * Create sample expenses for testing RBAC
 */
async function seedExpenses() {
  try {
    console.log('\n🧾 Creating sample expenses with RBAC...\n');

    // Get created users
    const admin1 = await User.findOne({ email: 'admin1@fieldx.com' });
    const admin2 = await User.findOne({ email: 'admin2@fieldx.com' });
    const user1 = await User.findOne({ email: 'user1@fieldx.com' });
    const user2 = await User.findOne({ email: 'user2@fieldx.com' });
    const user3 = await User.findOne({ email: 'user3@fieldx.com' });

    if (!admin1 || !admin2 || !user1 || !user2 || !user3) {
      throw new Error('Users not found - run user seeding first');
    }

    // Create expenses with user references
    const expensesWithUsers = sampleExpenses.map(expense => ({
      ...expense,
      userId: expense.userId || user1._id, // Default to user1
      approvedBy: expense.approvedBy === null ? admin1._id : expense.approvedBy
    }));

    for (const expenseData of expensesWithUsers) {
      // Check if expense already exists (avoid duplicates)
      const existingExpense = await Expense.findOne({
        userId: expenseData.userId,
        description: expenseData.description,
        date: expenseData.date
      });

      if (existingExpense) {
        console.log(`⚠️  Expense already exists: ${expenseData.description}`);
        continue;
      }

      const expense = new Expense(expenseData);
      await expense.save();
      console.log(`✅ Created expense: ${expenseData.description} (${expenseData.status})`);
    }

    console.log('\n🎉 Sample expenses created with RBAC!\n');
    console.log('Note: All sample expenses are assigned to Field Agent 1 (user1@fieldx.com)');
    console.log('      Admin Manager 1 can approve/reject these expenses');
    console.log('      Admin Manager 2 cannot see these expenses (not assigned to their users)');

  } catch (error) {
    console.error('❌ Expense seeding error:', error.message);
    throw error;
  }
}

/**
 * Seed default settings
 */
async function seedSettings() {
  try {
    console.log('\n📊 Seeding default settings...\n');

    // Find super admin for createdBy field
    const superAdmin = await User.findOne({ role: 'superadmin' });
    if (!superAdmin) {
      console.log('⚠️  No super admin found, skipping settings seed');
      return;
    }

    const defaultSettings = [
      {
        key: 'RATE_PER_KM',
        value: 8,
        type: 'number',
        label: 'Rate per KM',
        description: 'Petrol calculation rate per kilometer (₹)',
        category: 'rates',
        validation: {
          min: 0,
          max: 100,
          required: true
        },
        isEditable: true,
        isVisible: true,
        createdBy: superAdmin._id,
        updatedBy: superAdmin._id
      },
      {
        key: 'COST_PER_MACHINE_VISIT',
        value: 100,
        type: 'number',
        label: 'Cost per Machine Visit',
        description: 'Cost applied for each machine during machine visits (₹)',
        category: 'rates',
        validation: {
          min: 0,
          max: 10000,
          required: true
        },
        isEditable: true,
        isVisible: true,
        createdBy: superAdmin._id,
        updatedBy: superAdmin._id
      }
    ];

    for (const settingData of defaultSettings) {
      const existing = await Settings.findOne({ key: settingData.key });
      if (existing) {
        console.log(`⚠️  Setting already exists: ${settingData.key} = ${existing.value}`);
        continue;
      }

      const setting = new Settings(settingData);
      await setting.save();
      console.log(`✅ Created setting: ${settingData.key} = ${settingData.value}`);
    }

    console.log('\n🎉 Default settings created!\n');

  } catch (error) {
    console.error('❌ Settings seeding error:', error.message);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    await connectDB();
    await seedUsers();
    await seedSettings();
    await seedExpenses();
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the seed script
main();

