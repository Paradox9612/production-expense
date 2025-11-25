/**
 * Authentication Middleware
 * Verifies JWT tokens and protects routes
 */

const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Verify JWT token and attach user to request
 * @middleware
 * @description Extracts JWT from Authorization header, verifies it, and attaches user data to req.user
 * @access Protected routes
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization header provided'
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization header format. Use: Bearer <token>'
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Verify token using JWT utility
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Invalid or expired token'
      });
    }

    // Optional: Verify user still exists and is active
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account is inactive'
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.id,
      userId: decoded.id, // For backward compatibility
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Admin-only middleware (includes both admin and superadmin)
 * @middleware
 * @description Checks if authenticated user has admin or superadmin role
 * @access Admin routes only
 * @requires authMiddleware must be used before this middleware
 */
const adminOnly = (req, res, next) => {
  // Check if user is attached to request (should be done by authMiddleware)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Check if user has admin or superadmin role
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required. This action is restricted to administrators only.'
    });
  }

  next();
};

/**
 * Super Admin-only middleware
 * @middleware
 * @description Checks if authenticated user has superadmin role
 * @access Super Admin routes only
 * @requires authMiddleware must be used before this middleware
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Super Admin access required. This action is restricted to super administrators only.'
    });
  }

  next();
};

/**
 * Admin (Manager) only middleware - excludes superadmin
 * @middleware
 * @description Checks if authenticated user has admin role (not superadmin)
 * @access Admin (Manager) routes only
 * @requires authMiddleware must be used before this middleware
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin (Manager) access required.'
    });
  }

  next();
};

/**
 * Admin or Super Admin middleware
 * @middleware
 * @description Checks if authenticated user has admin or superadmin role
 * @access Admin or Super Admin routes
 * @requires authMiddleware must be used before this middleware
 */
const requireAdminOrSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Admin or Super Admin access required.'
    });
  }

  next();
};

/**
 * User-only middleware
 * @middleware
 * @description Checks if authenticated user has user role (field agent)
 * @access User routes only
 * @requires authMiddleware must be used before this middleware
 */
const requireUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'user') {
    return res.status(403).json({
      success: false,
      message: 'User access only. This action is restricted to field agents.'
    });
  }

  next();
};

module.exports = {
  authMiddleware,
  adminOnly,
  requireSuperAdmin,
  requireAdmin,
  requireAdminOrSuperAdmin,
  requireUser
};

