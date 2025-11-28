/**
 * Expense Model
 * Handles both journey-based and general expenses
 */

const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // Basic Information
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now,
    index: true
  },

  // Expense Category
  expenseCategory: {
    type: String,
    enum: ['general', 'journey'],
    default: 'general',
    required: [true, 'Expense category is required'],
    index: true
  },

  // Expense Type
  type: {
    type: String,
    enum: [
      'food',
      'lodging',
      'fuel',
      'tickets',
      'car_rental',
      'courier',
      'toll',
      'local_purchase',
      'transport_charges',
      'office_expense',
      'others',
      // Legacy types for backward compatibility
      'journey',
      'accessories',
      'other'
    ],
    required: [true, 'Expense type is required'],
    index: true
  },

  // Journey-Specific Fields (only for type='journey')
  journeyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Journey'
  },
  startCoordinates: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  endCoordinates: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  startAddress: {
    type: String,
    trim: true
  },
  endAddress: {
    type: String,
    trim: true
  },

  // Distance Tracking (in kilometers)
  systemDistance: {
    type: Number,
    min: [0, 'Distance cannot be negative'],
    default: 0
  },
  manualDistance: {
    type: Number,
    min: [0, 'Distance cannot be negative'],
    default: 0
  },
  adminDistance: {
    type: Number,
    min: [0, 'Distance cannot be negative']
  },

  // GPS Status
  gpsOffline: {
    type: Boolean,
    default: false
  },

  // General Expense Fields
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },

  // Amount Tracking
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  distanceRate: {
    type: Number,
    // No default - must be set explicitly from Settings.getRatePerKm() when creating journey expenses
    min: [0, 'Rate cannot be negative']
  },

  // File Attachments
  attachments: [{
    url: {
      type: String,
      required: true
    },
    filename: String,
    fileType: String,
    fileSize: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Approval Workflow
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    required: true,
    index: true
  },
  approvedOption: {
    type: Number,
    enum: [1, 2, 3], // 1=system, 2=manual, 3=admin
    min: 1,
    max: 3
  },
  approvedAmount: {
    type: Number,
    min: [0, 'Approved amount cannot be negative']
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Admin notes cannot exceed 1000 characters']
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason cannot exceed 500 characters']
  },

  // Bulk approval tracking
  bulkApproved: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
expenseSchema.index({ userId: 1, date: -1 });
expenseSchema.index({ userId: 1, status: 1 });
expenseSchema.index({ status: 1, date: -1 });
expenseSchema.index({ type: 1, status: 1 });
expenseSchema.index({ createdAt: -1 });

// Virtual: Calculate variance percentage
expenseSchema.virtual('variancePercentage').get(function() {
  if (this.type !== 'journey' || !this.systemDistance || this.systemDistance === 0) {
    return 0;
  }
  const variance = Math.abs(this.manualDistance - this.systemDistance);
  return (variance / this.systemDistance) * 100;
});

// Virtual: Variance category
expenseSchema.virtual('varianceCategory').get(function() {
  const variance = this.variancePercentage;
  if (variance <= 10) return 'low';
  if (variance <= 20) return 'medium';
  return 'high';
});

// Virtual: Final approved distance
expenseSchema.virtual('approvedDistance').get(function() {
  if (!this.approvedOption) return null;
  if (this.approvedOption === 1) return this.systemDistance;
  if (this.approvedOption === 2) return this.manualDistance;
  if (this.approvedOption === 3) return this.adminDistance;
  return null;
});

// Pre-save validation
expenseSchema.pre('save', function(next) {
  // Validate journeyId is required when expenseCategory is 'journey'
  if (this.expenseCategory === 'journey' && !this.journeyId) {
    return next(new Error('Journey ID is required when expense category is journey'));
  }
  next();
});

// Ensure virtuals are included
expenseSchema.set('toJSON', { virtuals: true });
expenseSchema.set('toObject', { virtuals: true });

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;

