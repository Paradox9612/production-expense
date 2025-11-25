/**
 * Authentication Routes
 * Routes for login, token refresh, and logout
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, refreshToken, logout, getCurrentUser, updateProfile, register } = require('../controllers/authController');
const { authMiddleware, requireSuperAdmin } = require('../middleware/auth');

/**
 * Rate limiter for login endpoint
 * Prevents brute force attacks
 * 5 requests per 15 minutes per IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skipSuccessfulRequests: false, // Count successful requests
  skipFailedRequests: false // Count failed requests
});

/**
 * Rate limiter for refresh token endpoint
 * 10 requests per 15 minutes per IP
 */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: {
    success: false,
    message: 'Too many token refresh attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user with email and password
 * @access  Public
 * @body    { email: string, password: string }
 * @returns { success: boolean, message: string, data: { user: object, accessToken: string, refreshToken: string } }
 */
router.post('/login', loginLimiter, login);

/**
 * @route   POST /api/auth/register
 * @desc    Register new user (Super Admin only)
 * @access  Private - Super Admin only
 * @headers Authorization: Bearer <token>
 * @body    { name: string, email: string, password: string, employeeId?: string, role?: string, assignedTo?: string }
 * @returns { success: boolean, message: string, data: { user: object, accessToken: string, refreshToken: string } }
 * @note    Registration is restricted to Super Admin only. Use employee creation endpoint for normal user creation.
 */
router.post('/register', authMiddleware, requireSuperAdmin, register);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 * @body    { refreshToken: string }
 * @returns { success: boolean, message: string, data: { accessToken: string, refreshToken: string } }
 */
router.post('/refresh', refreshLimiter, refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (creates audit log)
 * @access  Private
 * @headers Authorization: Bearer <token>
 * @returns { success: boolean, message: string }
 */
router.post('/logout', authMiddleware, logout);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 * @headers Authorization: Bearer <token>
 * @returns { success: boolean, data: { user: object } }
 */
router.get('/me', authMiddleware, getCurrentUser);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update current user profile
 * @access  Private
 * @headers Authorization: Bearer <token>
 * @body    { name?: string, bankDetails?: object, upiId?: string }
 * @returns { success: boolean, message: string, data: { user: object } }
 */
router.put('/profile', authMiddleware, updateProfile);

module.exports = router;

