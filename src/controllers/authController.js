/**
 * Authentication Controller
 * Handles user login, token refresh, and logout
 */

const User = require('../models/User');
const Journey = require('../models/Journey');
const Audit = require('../models/Audit');
const { generateTokenPair, verifyRefreshToken } = require('../utils/jwt');

/**
 * Login user with email and password
 * @route POST /api/auth/login
 * @access Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      await Audit.log({
        action: 'login',
        reason: 'Missing email or password',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'low',
        status: 'failed'
      });

      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      await Audit.log({
        action: 'login',
        reason: `User not found: ${email}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'medium',
        status: 'failed'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      await Audit.log({
        action: 'login',
        performedBy: user._id,
        targetUser: user._id,
        reason: 'User account is inactive',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'medium',
        status: 'failed'
      });

      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      await Audit.log({
        action: 'login',
        performedBy: user._id,
        targetUser: user._id,
        reason: 'Invalid password',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        severity: 'medium',
        status: 'failed'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user);

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Log successful login
    await Audit.log({
      action: 'login',
      performedBy: user._id,
      targetUser: user._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: 'low',
      status: 'success'
    });

    // Return tokens and user info (without password)
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toSafeObject(),
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    // Log error
    await Audit.log({
      action: 'login',
      reason: `Server error: ${error.message}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: 'high',
      status: 'failed'
    });

    res.status(500).json({
      success: false,
      message: 'An error occurred during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Refresh access token using refresh token
 * @route POST /api/auth/refresh
 * @access Public
 */
const refreshToken = async (req, res) => {
  try {
    const { refreshToken: token } = req.body;

    // Validate input
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Invalid refresh token'
      });
    }

    // Find user
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive'
      });
    }

    // Generate new token pair
    const tokens = generateTokenPair(user);

    // Log token refresh
    await Audit.log({
      action: 'login',
      performedBy: user._id,
      targetUser: user._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: 'low',
      status: 'success'
    });

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      }
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during token refresh',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Logout user (automatically ends active journeys)
 * @route POST /api/auth/logout
 * @access Private
 */
const logout = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find and cancel any active journeys for this user
    const activeJourneys = await Journey.find({ userId, status: 'active' });

    if (activeJourneys.length > 0) {
      console.log(`Found ${activeJourneys.length} active journey(s) for user ${userId} during logout`);

      // Cancel each active journey
      for (const journey of activeJourneys) {
        try {
          journey.status = 'cancelled';
          journey.notes = journey.notes
            ? `${journey.notes}\n\nJourney cancelled due to user logout.`
            : 'Journey cancelled due to user logout.';
          await journey.save();

          // Log journey cancellation
          await Audit.log({
            action: 'journey_cancelled',
            performedBy: userId,
            targetUser: userId,
            metadata: {
              journeyId: journey._id,
              reason: 'User logout',
              journeyName: journey.name
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            severity: 'medium',
            status: 'success'
          });

          console.log(`Cancelled journey ${journey._id} (${journey.name || 'unnamed'}) for user ${userId}`);
        } catch (journeyError) {
          console.error(`Error cancelling journey ${journey._id}:`, journeyError);
          // Continue with other journeys even if one fails
        }
      }
    }

    // Log logout
    await Audit.log({
      action: 'logout',
      performedBy: userId,
      targetUser: userId,
      metadata: {
        activeJourneysCancelled: activeJourneys.length
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: 'low',
      status: 'success'
    });

    res.json({
      success: true,
      message: 'Logout successful',
      data: {
        activeJourneysCancelled: activeJourneys.length
      }
    });

  } catch (error) {
    console.error('Logout error:', error);

    // Still try to log the error
    try {
      if (req.user) {
        await Audit.log({
          action: 'logout',
          performedBy: req.user.id,
          targetUser: req.user.id,
          reason: `Logout error: ${error.message}`,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'high',
          status: 'failed'
        });
      }
    } catch (auditError) {
      console.error('Error logging logout failure:', auditError);
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred during logout',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get current user profile
 * @route GET /api/auth/me
 * @access Private
 */
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        user: user.toSafeObject()
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching user data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update current user profile
 * @route PUT /api/auth/profile
 * @access Private
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;

    // Fields that users can update
    const allowedFields = ['name', 'bankDetails', 'upiId'];
    const filteredUpdates = {};

    // Filter out only allowed fields
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });

    // If no valid fields to update
    if (Object.keys(filteredUpdates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      });
    }

    // Validate bank details if provided
    if (filteredUpdates.bankDetails) {
      const { accountNumber, ifscCode } = filteredUpdates.bankDetails;
      if (accountNumber && !/^\d{9,18}$/.test(accountNumber)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid account number format'
        });
      }
      if (ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid IFSC code format'
        });
      }
      // Convert IFSC to uppercase
      if (ifscCode) {
        filteredUpdates.bankDetails.ifscCode = ifscCode.toUpperCase();
      }
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      filteredUpdates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log profile update
    await Audit.log({
      action: 'settings_updated',
      performedBy: userId,
      targetUser: userId,
      metadata: {
        updatedFields: Object.keys(filteredUpdates)
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: 'low',
      status: 'success'
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.toSafeObject()
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);

    // Log error
    try {
      if (req.user) {
        await Audit.log({
          action: 'settings_updated',
          performedBy: req.user.id,
          targetUser: req.user.id,
          reason: `Profile update error: ${error.message}`,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          severity: 'medium',
          status: 'failed'
        });
      }
    } catch (auditError) {
      console.error('Error logging profile update failure:', auditError);
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while updating profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Register new user
 * @route POST /api/auth/register
 * @access Public (but should be restricted in production)
 */
const register = async (req, res) => {
  try {
    const { name, email, password, employeeId, role } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { employeeId: employeeId?.toUpperCase() }
      ]
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: existingUser.email === email.toLowerCase()
          ? 'Email already registered'
          : 'Employee ID already exists'
      });
    }

    // Create new user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password, // Will be hashed by pre-save hook
      employeeId: employeeId?.toUpperCase(),
      role: role || 'user',
      isActive: true
    });

    await user.save();

    // Generate tokens for immediate login
    const { accessToken, refreshToken } = generateTokenPair(user);

    // Log registration
    await Audit.log({
      action: 'user_created',
      performedBy: user._id,
      targetUser: user._id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: 'medium',
      status: 'success'
    });

    // Return success with tokens
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toSafeObject(),
        accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    // Log error
    await Audit.log({
      action: 'user_created',
      reason: `Server error: ${error.message}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      severity: 'high',
      status: 'failed'
    });

    res.status(500).json({
      success: false,
      message: 'An error occurred during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  login,
  refreshToken,
  logout,
  getCurrentUser,
  updateProfile,
  register
};

