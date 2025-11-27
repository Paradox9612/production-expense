/**
 * User Model (Employee)
 * Handles employee authentication, profile, and balance tracking
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  // Authentication
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false // Don't return password by default
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'user'],
    default: 'user',
    required: true
  },

  // RBAC: Admin Assignment (for users only)
  // Users are assigned to an admin who manages them
  // Admins and superadmins have this field as null
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    validate: {
      validator: async function(value) {
        // If assignedTo is set, verify the assigned user is an admin or superadmin
        if (value) {
          const assignedUser = await mongoose.model('User').findById(value);
          return assignedUser && (assignedUser.role === 'admin' || assignedUser.role === 'superadmin');
        }
        return true;
      },
      message: 'Assigned user must be an admin or superadmin'
    }
  },

  // Profile Information
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  employeeId: {
    type: String,
    required: [true, 'Employee ID is required'],
    unique: true,
    trim: true,
    uppercase: true
  },

  // Banking Details
  bankDetails: {
    accountNumber: {
      type: String,
      trim: true
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true
    },
    bankName: {
      type: String,
      trim: true
    },
    accountHolderName: {
      type: String,
      trim: true
    }
  },
  upiId: {
    type: String,
    trim: true,
    lowercase: true
  },

  // Balance Tracking
  advanceBalance: {
    type: Number,
    default: 0
  },

  // Status
  isActive: {
    type: Boolean,
    default: true
  },

  // Metadata
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Indexes for performance
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ assignedTo: 1 }); // For filtering users by assigned admin
userSchema.index({ createdAt: -1 });

// Pre-save hook: Hash password before saving
userSchema.pre('save', async function(next) {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method: Compare password for login
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method: Get user without sensitive data
userSchema.methods.toSafeObject = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

// Static method: Find active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

// Static method: Find by employee ID
userSchema.statics.findByEmployeeId = function(employeeId) {
  return this.findOne({ employeeId: employeeId.toUpperCase() });
};

// Virtual: Full bank details formatted
userSchema.virtual('formattedBankDetails').get(function() {
  if (!this.bankDetails || !this.bankDetails.accountNumber) {
    return 'Not provided';
  }
  return `${this.bankDetails.bankName} - ${this.bankDetails.accountNumber} (${this.bankDetails.ifscCode})`;
});

// Virtual: Get all users assigned to this admin
// Only populated for admin/superadmin roles
userSchema.virtual('assignedUsers', {
  ref: 'User',
  localField: '_id',
  foreignField: 'assignedTo',
  justOne: false
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

module.exports = User;

