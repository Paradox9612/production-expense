/**
 * Audit Model
 * Tracks all important actions and changes in the system
 */

const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  // Action Information
  action: {
    type: String,
    required: [true, 'Action is required'],
    enum: [
      'user_created',
      'user_updated',
      'user_deleted',
      'expense_created',
      'expense_updated',
      'expense_approved',
      'expense_bulk_approved',
      'expense_rejected',
      'expense_deleted',
      'advance_added',
      'advance_cancelled',
      'journey_started',
      'journey_ended',
      'journey_cancelled',
      'file_uploaded',
      'month_locked',
      'month_unlocked',
      'login',
      'logout',
      'password_changed',
      'password_reset',
      'settings_updated',
      'report_generated',
      'other'
    ],
    index: true
  },

  // Who performed the action
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Performed by is required'],
    index: true
  },

  // Target entities
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetExpense: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  },
  targetJourney: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Journey'
  },
  targetAdvance: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Advance'
  },

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Changes made (for update actions)
  changes: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Previous values (for rollback if needed)
  previousValues: {
    type: mongoose.Schema.Types.Mixed
  },

  // New values
  newValues: {
    type: mongoose.Schema.Types.Mixed
  },

  // Reason/Notes
  reason: {
    type: String,
    trim: true,
    maxlength: [1000, 'Reason cannot exceed 1000 characters']
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },

  // Request metadata
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },

  // Timestamp
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },

  // Severity level
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },

  // Status
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success'
  }
}, {
  timestamps: true
});

// Indexes for performance
auditSchema.index({ performedBy: 1, timestamp: -1 });
auditSchema.index({ action: 1, timestamp: -1 });
auditSchema.index({ targetUser: 1, timestamp: -1 });
auditSchema.index({ targetExpense: 1, timestamp: -1 });
auditSchema.index({ timestamp: -1 });
auditSchema.index({ severity: 1, timestamp: -1 });

// Virtual: Action description
auditSchema.virtual('actionDescription').get(function() {
  const actionMap = {
    'expense_approved': 'Expense approved',
    'expense_rejected': 'Expense rejected',
    'advance_added': 'Advance payment added',
    'user_created': 'User created',
    'month_locked': 'Month locked'
  };
  return actionMap[this.action] || this.action.replace(/_/g, ' ');
});

// Static method: Create audit log
auditSchema.statics.log = async function(data) {
  try {
    const audit = new this(data);
    await audit.save();
    return audit;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error - audit logging should not break main flow
    return null;
  }
};

// Static method: Get user activity
auditSchema.statics.getUserActivity = function(userId, limit = 50) {
  return this.find({ performedBy: userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('targetUser', 'name email')
    .populate('targetExpense', 'type amount');
};

// Static method: Get expense history
auditSchema.statics.getExpenseHistory = function(expenseId) {
  return this.find({ targetExpense: expenseId })
    .sort({ timestamp: 1 })
    .populate('performedBy', 'name email role');
};

// Static method: Get recent activity
auditSchema.statics.getRecentActivity = function(limit = 100) {
  return this.find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .populate('performedBy', 'name email role')
    .populate('targetUser', 'name email');
};

// Ensure virtuals are included
auditSchema.set('toJSON', { virtuals: true });
auditSchema.set('toObject', { virtuals: true });

const Audit = mongoose.model('Audit', auditSchema);

module.exports = Audit;

