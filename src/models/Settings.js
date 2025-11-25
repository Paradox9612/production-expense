/**
 * Settings Model
 * Stores system-wide configuration settings
 */

const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  // Setting Key (unique identifier)
  key: {
    type: String,
    required: [true, 'Setting key is required'],
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },

  // Setting Value
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Setting value is required']
  },

  // Setting Type
  type: {
    type: String,
    enum: ['number', 'string', 'boolean', 'object'],
    required: [true, 'Setting type is required']
  },

  // Display Information
  label: {
    type: String,
    required: [true, 'Setting label is required'],
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['general', 'rates', 'limits', 'features'],
    default: 'general'
  },

  // Validation Rules
  validation: {
    min: Number,
    max: Number,
    required: Boolean,
    pattern: String
  },

  // Metadata
  isEditable: {
    type: Boolean,
    default: true
  },
  isVisible: {
    type: Boolean,
    default: true
  },

  // Audit Trail
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
settingsSchema.index({ key: 1 }, { unique: true });
settingsSchema.index({ category: 1 });
settingsSchema.index({ isVisible: 1 });

// Static method: Get setting by key
settingsSchema.statics.getSetting = async function(key) {
  const setting = await this.findOne({ key: key.toUpperCase() });
  return setting ? setting.value : null;
};

// Static method: Update setting
settingsSchema.statics.updateSetting = async function(key, value, userId) {
  const setting = await this.findOneAndUpdate(
    { key: key.toUpperCase() },
    { 
      value,
      updatedBy: userId,
      updatedAt: new Date()
    },
    { new: true, runValidators: true }
  );
  return setting;
};

// Static method: Get all settings by category
settingsSchema.statics.getByCategory = function(category) {
  return this.find({ category, isVisible: true }).sort({ label: 1 });
};

// Static method: Get rate per KM
settingsSchema.statics.getRatePerKm = async function() {
  const setting = await this.getSetting('RATE_PER_KM');
  return setting || 8; // Default to 8 if not set
};

// Static method: Get cost per machine visit
settingsSchema.statics.getCostPerMachineVisit = async function() {
  const setting = await this.getSetting('COST_PER_MACHINE_VISIT');
  return setting || 100; // Default to 100 if not set
};

// Instance method: Validate value against rules
settingsSchema.methods.validateValue = function(value) {
  if (!this.validation) return true;

  if (this.type === 'number') {
    const numValue = Number(value);
    if (isNaN(numValue)) return false;
    if (this.validation.min !== undefined && numValue < this.validation.min) return false;
    if (this.validation.max !== undefined && numValue > this.validation.max) return false;
  }

  return true;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;

