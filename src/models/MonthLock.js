/**
 * MonthLock Model
 * Manages month closing/locking mechanism for sequential month closure
 */

const mongoose = require('mongoose');

const monthLockSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // Month and Year
  month: {
    type: Number,
    required: [true, 'Month is required'],
    min: [1, 'Month must be between 1 and 12'],
    max: [12, 'Month must be between 1 and 12']
  },
  year: {
    type: Number,
    required: [true, 'Year is required'],
    min: [2020, 'Year must be 2020 or later'],
    max: [2100, 'Year must be before 2100']
  },

  // Lock Status
  isLocked: {
    type: Boolean,
    default: true,
    required: true
  },

  // Closure Information
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Closed by is required']
  },
  closedAt: {
    type: Date,
    default: Date.now,
    required: true
  },

  // Unlocking (if reopened)
  unlockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  unlockedAt: {
    type: Date
  },
  unlockReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Unlock reason cannot exceed 500 characters']
  },

  // Summary at time of closure
  summary: {
    totalExpenses: {
      type: Number,
      default: 0
    },
    totalApproved: {
      type: Number,
      default: 0
    },
    totalRejected: {
      type: Number,
      default: 0
    },
    totalPending: {
      type: Number,
      default: 0
    },
    totalAmount: {
      type: Number,
      default: 0
    },
    totalAdvances: {
      type: Number,
      default: 0
    },
    closingBalance: {
      type: Number,
      default: 0
    }
  },

  // Notes
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  }
}, {
  timestamps: true
});

// Compound unique index - one lock per user per month/year
monthLockSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

// Other indexes
monthLockSchema.index({ userId: 1, isLocked: 1 });
monthLockSchema.index({ year: 1, month: 1 });
monthLockSchema.index({ closedAt: -1 });

// Virtual: Month name
monthLockSchema.virtual('monthName').get(function() {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[this.month - 1];
});

// Virtual: Period string
monthLockSchema.virtual('period').get(function() {
  return `${this.monthName} ${this.year}`;
});

// Virtual: Date range for the month
monthLockSchema.virtual('dateRange').get(function() {
  const startDate = new Date(this.year, this.month - 1, 1);
  const endDate = new Date(this.year, this.month, 0, 23, 59, 59);
  return { startDate, endDate };
});

// Instance method: Unlock month
monthLockSchema.methods.unlock = function(unlockedBy, reason) {
  this.isLocked = false;
  this.unlockedBy = unlockedBy;
  this.unlockedAt = new Date();
  this.unlockReason = reason;
  return this.save();
};

// Instance method: Re-lock month
monthLockSchema.methods.relock = function() {
  this.isLocked = true;
  return this.save();
};

// Static method: Check if month is locked
monthLockSchema.statics.isMonthLocked = async function(userId, year, month) {
  const lock = await this.findOne({ userId, year, month, isLocked: true });
  return !!lock;
};

// Static method: Get locked months for user
monthLockSchema.statics.getLockedMonths = function(userId) {
  return this.find({ userId, isLocked: true })
    .sort({ year: -1, month: -1 })
    .populate('closedBy', 'name email');
};

// Static method: Get latest locked month
monthLockSchema.statics.getLatestLock = function(userId) {
  return this.findOne({ userId, isLocked: true })
    .sort({ year: -1, month: -1 })
    .populate('closedBy', 'name email');
};

// Static method: Create month lock with summary
monthLockSchema.statics.createLock = async function(userId, year, month, closedBy, summary, notes) {
  // Check if already locked
  const existing = await this.findOne({ userId, year, month });
  if (existing && existing.isLocked) {
    throw new Error('Month is already locked');
  }

  // Create or update lock
  const lock = existing || new this({ userId, year, month });
  lock.isLocked = true;
  lock.closedBy = closedBy;
  lock.closedAt = new Date();
  lock.summary = summary;
  lock.notes = notes;
  
  return lock.save();
};

// Ensure virtuals are included
monthLockSchema.set('toJSON', { virtuals: true });
monthLockSchema.set('toObject', { virtuals: true });

const MonthLock = mongoose.model('MonthLock', monthLockSchema);

module.exports = MonthLock;

