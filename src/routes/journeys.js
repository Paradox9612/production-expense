/**
 * Journey Routes
 * Handles journey tracking endpoints
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const {
  startJourney,
  endJourney,
  getJourneyById,
  getAllJourneys,
  cancelJourney,
  getActiveJourney
} = require('../controllers/journeyController');
const {
  validate,
  validateObjectId,
  startJourneySchema,
  endJourneySchema,
  journeyPaginationSchema
} = require('../utils/validators');

// Apply authentication middleware to all routes
router.use(authMiddleware);

/**
 * @route   GET /api/journeys/active
 * @desc    Get active journey for current user
 * @access  Private
 */
router.get('/active', getActiveJourney);

/**
 * @route   POST /api/journeys/start
 * @desc    Start a new journey
 * @access  Private
 */
router.post('/start', validate(startJourneySchema), startJourney);

/**
 * @route   GET /api/journeys
 * @desc    Get all journeys with pagination and filters
 * @access  Private
 */
router.get('/', validate(journeyPaginationSchema, 'query'), getAllJourneys);

/**
 * @route   GET /api/journeys/:id
 * @desc    Get journey by ID
 * @access  Private
 */
router.get('/:id', validateObjectId('id'), getJourneyById);

/**
 * @route   PUT /api/journeys/:id/end
 * @desc    End an active journey
 * @access  Private
 */
router.put('/:id/end', validateObjectId('id'), validate(endJourneySchema), endJourney);

/**
 * @route   PUT /api/journeys/:id/cancel
 * @desc    Cancel an active journey
 * @access  Private
 */
router.put('/:id/cancel', validateObjectId('id'), cancelJourney);

module.exports = router;

