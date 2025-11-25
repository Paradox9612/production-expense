/**
 * Journey Model
 * Tracks GPS-based journeys from start to end
 */

const mongoose = require('mongoose');

const journeySchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },

  // Journey Name (Customer Name)
  name: {
    type: String,
    trim: true,
    maxlength: [100, 'Journey name cannot exceed 100 characters'],
    index: true
  },
  customerName: {
    type: String,
    trim: true,
    maxlength: [100, 'Customer name cannot exceed 100 characters']
  },

  // Nature of Work
  natureOfWork: {
    type: String,
    trim: true,
    maxlength: [500, 'Nature of work cannot exceed 500 characters']
  },

  // Type of Visit
  typeOfVisit: {
    type: String,
    enum: ['sales_call', 'service_call', 'inspection', 'group_visit', 'machine_visit'],
    trim: true
  },

  // Machine Visit Details (only for machine_visit type)
  numberOfMachines: {
    type: Number,
    min: [1, 'Number of machines must be at least 1'],
    max: [10, 'Number of machines cannot exceed 10']
  },
  machineVisitCost: {
    type: Number,
    min: [0, 'Machine visit cost cannot be negative'],
    default: 0
  },

  // Site Location (from end journey)
  siteLocation: {
    type: String,
    trim: true
  },

  // Start Location
  startCoordinates: {
    latitude: {
      type: Number,
      required: [true, 'Start latitude is required'],
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
      type: Number,
      required: [true, 'Start longitude is required'],
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
    }
  },
  startAddress: {
    type: String,
    trim: true
  },
  startTimestamp: {
    type: Date,
    required: [true, 'Start timestamp is required'],
    default: Date.now,
    index: true
  },

  // End Location
  endCoordinates: {
    latitude: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
    }
  },
  endAddress: {
    type: String,
    trim: true
  },
  endTimestamp: {
    type: Date
  },

  // Journey Status
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
    required: true,
    index: true
  },

  // GPS Status
  gpsOffline: {
    type: Boolean,
    default: false
  },
  gpsOfflineReason: {
    type: String,
    enum: ['permission_denied', 'location_disabled', 'timeout', 'other'],
    trim: true
  },

  // Calculated Data
  calculatedDistance: {
    type: Number, // in kilometers
    min: [0, 'Distance cannot be negative']
  },
  calculatedDuration: {
    type: Number, // in minutes
    min: [0, 'Duration cannot be negative']
  },

  // Associated Expenses
  expenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  },
  additionalExpensesTotal: {
    type: Number,
    default: 0,
    min: [0, 'Additional expenses total cannot be negative']
  },

  // Metadata
  deviceInfo: {
    platform: String,
    osVersion: String,
    appVersion: String
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Indexes for performance
journeySchema.index({ userId: 1, startTimestamp: -1 });
journeySchema.index({ userId: 1, status: 1 });
journeySchema.index({ status: 1, createdAt: -1 });
journeySchema.index({ expenseId: 1 });
journeySchema.index({ name: 1 }); // Allow duplicate names per user

// Virtual: Duration in minutes
journeySchema.virtual('durationMinutes').get(function() {
  if (!this.endTimestamp || !this.startTimestamp) {
    return null;
  }
  const diff = this.endTimestamp - this.startTimestamp;
  return Math.round(diff / 1000 / 60); // Convert ms to minutes
});

// Virtual: Is journey active
journeySchema.virtual('isActive').get(function() {
  return this.status === 'active';
});

// Virtual: Formatted coordinates
journeySchema.virtual('startCoordinatesString').get(function() {
  if (!this.startCoordinates) return null;
  return `${this.startCoordinates.latitude},${this.startCoordinates.longitude}`;
});

journeySchema.virtual('endCoordinatesString').get(function() {
  if (!this.endCoordinates) return null;
  return `${this.endCoordinates.latitude},${this.endCoordinates.longitude}`;
});

// Instance method: Complete journey
journeySchema.methods.complete = function(endCoords, endAddress, calculatedDistance) {
  this.endCoordinates = endCoords;
  this.endAddress = endAddress;
  this.endTimestamp = new Date();
  this.calculatedDistance = calculatedDistance;
  this.status = 'completed';
  return this.save();
};

// Instance method: Cancel journey
journeySchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  this.notes = reason || 'Journey cancelled by user';
  return this.save();
};

// Static method: Find active journey for user
journeySchema.statics.findActiveJourney = function(userId) {
  return this.findOne({ userId, status: 'active' });
};

// Static method: Get user's journey history
journeySchema.statics.getUserHistory = function(userId, limit = 20) {
  return this.find({ userId, status: 'completed' })
    .sort({ startTimestamp: -1 })
    .limit(limit);
};

// Ensure virtuals are included
journeySchema.set('toJSON', { virtuals: true });
journeySchema.set('toObject', { virtuals: true });

const Journey = mongoose.model('Journey', journeySchema);

module.exports = Journey;

