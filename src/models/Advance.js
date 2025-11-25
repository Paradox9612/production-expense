/**
 * Advance Model
 * Tracks advance payments given to employees
 */

const mongoose = require('mongoose');

const advanceSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // Amount
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0.01, 'Amount must be greater than 0']
  },

  // Date
  date: {
    type: Date,
    required: [true, 'Date is required'],
    default: Date.now,
    index: true
  },

  // Proof Document
  proofUrl: {
    type: String,
    trim: true
  },
  proofFilename: {
    type: String,
    trim: true
  },

  // Notes
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },

  // Admin who added the advance
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Added by is required']
  },

  // Payment Method
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'upi', 'cheque', 'other'],
    default: 'bank_transfer'
  },

  // Transaction Reference
  transactionReference: {
    type: String,
    trim: true
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'completed',
    index: true
  },

  // Metadata
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for performance
advanceSchema.index({ userId: 1, date: -1 });
advanceSchema.index({ userId: 1, status: 1 });
advanceSchema.index({ addedBy: 1, createdAt: -1 });
advanceSchema.index({ status: 1, date: -1 });
advanceSchema.index({ createdAt: -1 });

// Virtual: Formatted amount
advanceSchema.virtual('formattedAmount').get(function() {
  return `₹${this.amount.toFixed(2)}`;
});

// Virtual: Month and year
advanceSchema.virtual('monthYear').get(function() {
  const date = this.date || this.createdAt;
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear()
  };
});

// Instance method: Cancel advance
advanceSchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  this.notes = reason || 'Advance cancelled';
  return this.save();
};

// Static method: Get total advances for user
advanceSchema.statics.getTotalForUser = async function(userId, status = 'completed') {
  const result = await this.aggregate([
    { 
      $match: { 
        userId: mongoose.Types.ObjectId(userId),
        status: status,
        isDeleted: false
      } 
    },
    { 
      $group: { 
        _id: null, 
        total: { $sum: '$amount' } 
      } 
    }
  ]);
  
  return result.length > 0 ? result[0].total : 0;
};

// Static method: Get advances by month
advanceSchema.statics.getByMonth = function(userId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  return this.find({
    userId,
    date: { $gte: startDate, $lte: endDate },
    status: 'completed',
    isDeleted: false
  }).sort({ date: -1 });
};

// Static method: Get recent advances
advanceSchema.statics.getRecent = function(userId, limit = 10) {
  return this.find({ 
    userId, 
    isDeleted: false 
  })
    .sort({ date: -1 })
    .limit(limit)
    .populate('addedBy', 'name email');
};

// Ensure virtuals are included
advanceSchema.set('toJSON', { virtuals: true });
advanceSchema.set('toObject', { virtuals: true });

const Advance = mongoose.model('Advance', advanceSchema);

module.exports = Advance;

