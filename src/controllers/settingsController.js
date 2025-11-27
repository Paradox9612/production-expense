/**
 * Settings Controller
 * Handles system-wide configuration settings
 */

const { Settings, Audit } = require('../models');

/**
 * Get all settings
 * GET /api/settings
 */
exports.getAllSettings = async (req, res) => {
  try {
    const settings = await Settings.find({ isVisible: true })
      .populate('updatedBy', 'name email')
      .sort({ category: 1, label: 1 });

    res.status(200).json({
      success: true,
      count: settings.length,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings',
      error: error.message
    });
  }
};

/**
 * Get settings by category
 * GET /api/settings/category/:category
 */
exports.getSettingsByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const settings = await Settings.getByCategory(category);

    res.status(200).json({
      success: true,
      count: settings.length,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching settings by category:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching settings',
      error: error.message
    });
  }
};

/**
 * Get single setting by key
 * GET /api/settings/:key
 */
exports.getSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const setting = await Settings.findOne({ key: key.toUpperCase() })
      .populate('updatedBy', 'name email');

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    res.status(200).json({
      success: true,
      data: setting
    });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching setting',
      error: error.message
    });
  }
};

/**
 * Update setting
 * PUT /api/settings/:key
 * Access: Admin/SuperAdmin only
 */
exports.updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const userId = req.user.userId;

    // Find the setting
    const setting = await Settings.findOne({ key: key.toUpperCase() });

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'Setting not found'
      });
    }

    // Check if setting is editable
    if (!setting.isEditable) {
      return res.status(403).json({
        success: false,
        message: 'This setting cannot be edited'
      });
    }

    // Validate value
    if (!setting.validateValue(value)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid value for this setting'
      });
    }

    // Update setting
    setting.value = value;
    setting.updatedBy = userId;
    setting.updatedAt = new Date();
    await setting.save();

    // Create audit log
    await Audit.create({
      performedBy: userId,
      action: 'settings_updated',
      metadata: {
        key: setting.key,
        oldValue: setting.value,
        newValue: value
      }
    });

    res.status(200).json({
      success: true,
      message: 'Setting updated successfully',
      data: setting
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating setting',
      error: error.message
    });
  }
};

/**
 * Initialize default settings
 * POST /api/settings/initialize
 * Access: SuperAdmin only
 */
exports.initializeSettings = async (req, res) => {
  try {
    const userId = req.user.userId;

    const defaultSettings = [
      {
        key: 'RATE_PER_KM',
        value: 8,
        type: 'number',
        label: 'Rate per KM',
        description: 'Petrol calculation rate per kilometer',
        category: 'rates',
        validation: {
          min: 0,
          max: 100,
          required: true
        },
        isEditable: true,
        isVisible: true,
        createdBy: userId,
        updatedBy: userId
      },
      {
        key: 'COST_PER_MACHINE_VISIT',
        value: 100,
        type: 'number',
        label: 'Cost per Machine Visit',
        description: 'Cost applied for each machine during machine visits',
        category: 'rates',
        validation: {
          min: 0,
          max: 10000,
          required: true
        },
        isEditable: true,
        isVisible: true,
        createdBy: userId,
        updatedBy: userId
      }
    ];

    const results = [];
    for (const settingData of defaultSettings) {
      const existing = await Settings.findOne({ key: settingData.key });
      if (!existing) {
        const setting = await Settings.create(settingData);
        results.push(setting);
      }
    }

    res.status(200).json({
      success: true,
      message: `Initialized ${results.length} settings`,
      data: results
    });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error initializing settings',
      error: error.message
    });
  }
};

