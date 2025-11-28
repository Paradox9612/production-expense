/**
 * Journey Controller
 * Handles journey tracking with GPS coordinates and distance calculation
 */

const Journey = require('../models/Journey');
const Expense = require('../models/Expense');
const Audit = require('../models/Audit');
const Settings = require('../models/Settings');
const { calculateDistance, calculateDistanceWithHaversine, calculateJourneyCost } = require('../utils/distanceCalculator');

/**
 * Start a new journey
 * POST /api/journeys/start
 * @access Private
 */
const startJourney = async (req, res) => {
  try {
    const {
      name,
      customerName,
      natureOfWork,
      typeOfVisit,
      numberOfMachines,
      startCoordinates,
      startAddress,
      gpsOffline,
      gpsOfflineReason,
      deviceInfo,
      notes
    } = req.body;
    const userId = req.user.id;

    console.log('Received journey data:', {
      name,
      customerName,
      natureOfWork,
      typeOfVisit,
      numberOfMachines
    });

    // Check if user already has an active journey
    const activeJourney = await Journey.findActiveJourney(userId);

    if (activeJourney) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active journey. Please end it before starting a new one.',
        data: { activeJourneyId: activeJourney._id }
      });
    }

    // Check if journey name already exists for this user
    const existingJourney = await Journey.findOne({ userId, name });
    if (existingJourney) {
      return res.status(400).json({
        success: false,
        message: 'A journey with this name already exists. Please choose a different name.',
        data: { existingJourneyId: existingJourney._id }
      });
    }

    // Validate typeOfVisit and numberOfMachines
    if (typeOfVisit === 'machine_visit' && (!numberOfMachines || numberOfMachines < 1)) {
      return res.status(400).json({
        success: false,
        message: 'Number of machines is required for machine visit type'
      });
    }

    // Create new journey
    const journey = new Journey({
      userId,
      name,
      customerName,
      natureOfWork,
      typeOfVisit,
      numberOfMachines: typeOfVisit === 'machine_visit' ? numberOfMachines : undefined,
      startCoordinates,
      startAddress,
      startTimestamp: new Date(),
      status: 'active',
      gpsOffline: gpsOffline || false,
      gpsOfflineReason,
      deviceInfo,
      notes
    });

    await journey.save();

    // Create audit log
    await Audit.log({
      action: 'journey_started',
      performedBy: userId,
      targetUser: userId,
      metadata: {
        journeyId: journey._id,
        startCoordinates,
        gpsOffline: journey.gpsOffline
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      success: true,
      message: 'Journey started successfully',
      data: { journey }
    });
  } catch (error) {
    console.error('Start journey error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start journey',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * End an active journey
 * PUT /api/journeys/:id/end
 * @access Private
 */
const endJourney = async (req, res) => {
   try {
     console.log('endJourney called with:', { id: req.params.id, userId: req.user.id });
     const { id } = req.params;
     const { endCoordinates, endAddress, notes, manualDistance } = req.body;
     const userId = req.user.id;

    // Find journey
    const journey = await Journey.findById(id);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Journey not found'
      });
    }

    // Check ownership
    if (journey.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only end your own journeys'
      });
    }

    // Check if journey is already completed
    if (journey.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Journey is already ${journey.status}`
      });
    }

    // Update journey end details
    journey.endCoordinates = endCoordinates;
    journey.endAddress = endAddress;
    journey.siteLocation = endAddress; // Store end location as site location
    journey.endTimestamp = new Date();

    if (notes) {
      journey.notes = notes;
    }

    // Calculate machine visit cost if applicable
    if (journey.typeOfVisit === 'machine_visit' && journey.numberOfMachines) {
      const costPerMachine = await Settings.getCostPerMachineVisit();
      journey.machineVisitCost = journey.numberOfMachines * costPerMachine;
      console.log(`Machine visit cost calculated: ${journey.numberOfMachines} machines × ₹${costPerMachine} = ₹${journey.machineVisitCost}`);
    }

    console.log('Starting distance calculation...');

    // Calculate system distance (always the actual distance between start and end coordinates)
    let distanceData = null;
    let systemDistance = 0;
    let calculatedDuration = null;

    if (!journey.gpsOffline) {
      console.log('GPS not offline, calculating distance...');
      // Use Haversine formula for fast calculation (primary method)
      try {
        console.log('Using Haversine formula for distance calculation');
        const haversineResult = calculateDistanceWithHaversine(
          journey.startCoordinates,
          endCoordinates
        );
        console.log('Haversine distance result:', haversineResult);
        systemDistance = haversineResult.distance;
        calculatedDuration = null; // Haversine doesn't provide duration
        distanceData = { source: 'haversine' };

        // Optionally try Google Maps for duration (but don't wait for it)
        try {
          console.log('Attempting Google Maps for duration (non-blocking)...');
          calculateDistance(journey.startCoordinates, endCoordinates, { retries: 0 })
            .then(googleResult => {
              if (googleResult.duration) {
                console.log('Google Maps duration available:', googleResult.duration);
                // Note: This won't update the response since it's already sent
              }
            })
            .catch(err => {
              console.log('Google Maps duration failed (expected):', err.message);
            });
        } catch (googleError) {
          console.log('Google Maps duration attempt failed:', googleError.message);
        }
      } catch (error) {
        console.error('Distance calculation error:', error);
        // If calculation fails, set distance to 0 and log error
        distanceData = { source: 'error', error: error.message };
      }
    } else {
      console.log('GPS offline, skipping distance calculation');
    }

    // Use manual distance if provided, otherwise use system distance
    const finalDistance = req.body.manualDistance ? parseFloat(req.body.manualDistance) : systemDistance;

    journey.calculatedDistance = finalDistance;
    journey.calculatedDuration = calculatedDuration;
    journey.status = 'completed';

    console.log('Saving journey...');
    await journey.save();
    console.log('Journey saved successfully');

    // Get global rate per km setting
    const ratePerKm = await Settings.getRatePerKm();

    // Calculate cost based on final distance
    const cost = calculateJourneyCost(finalDistance, ratePerKm);
    console.log('Calculated cost:', cost);

    // Create expense automatically
    console.log('Creating expense...');
    const expense = new Expense({
      userId,
      type: 'journey',
      date: new Date(),
      description: `Journey from ${journey.startAddress} to ${journey.endAddress}`,
      amount: cost,
      journeyId: journey._id,
      startCoordinates: journey.startCoordinates,
      endCoordinates: journey.endCoordinates,
      startAddress: journey.startAddress,
      endAddress: journey.endAddress,
      systemDistance: systemDistance,
      manualDistance: req.body.manualDistance ? parseFloat(req.body.manualDistance) : null,
      gpsOffline: journey.gpsOffline,
      distanceRate: ratePerKm,
      status: 'pending'
    });

    await expense.save();
    console.log('Expense created successfully');

    // Link expense to journey
    journey.expenseId = expense._id;
    await journey.save();

    // Create audit log for journey
    await Audit.log({
      action: 'journey_ended',
      performedBy: userId,
      targetUser: userId,
      metadata: {
        journeyId: journey._id,
        expenseId: expense._id,
        endCoordinates,
        systemDistance,
        manualDistance: req.body.manualDistance ? parseFloat(req.body.manualDistance) : null,
        finalDistance,
        duration: calculatedDuration,
        cost,
        distanceSource: distanceData?.source
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Create audit log for expense creation
    await Audit.log({
      action: 'expense_created',
      performedBy: userId,
      targetUser: userId,
      metadata: {
        expenseId: expense._id,
        journeyId: journey._id,
        type: 'journey',
        amount: cost,
        description: expense.description
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Journey ended successfully and expense created',
      data: {
        journey,
        expense,
        systemDistance,
        manualDistance: req.body.manualDistance ? parseFloat(req.body.manualDistance) : null,
        finalDistance,
        calculatedDuration,
        cost,
        distanceCalculation: distanceData
      }
    });
  } catch (error) {
    console.error('End journey error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end journey',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get journey by ID
 * GET /api/journeys/:id
 * @access Private
 * @description
 * - Super Admin can see any journey
 * - Admin can only see journeys from users assigned to them
 * - Users can only see their own journeys
 */
const getJourneyById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const journey = await Journey.findById(id).populate('userId', 'name email employeeId');

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Journey not found'
      });
    }

    // RBAC: Check access permissions
    if (userRole === 'user') {
      // Users can only see their own journeys
      if (journey.userId._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own journeys.'
        });
      }
    } else if (userRole === 'admin') {
      // Admin can only see journeys from users assigned to them
      const User = require('../models/User');
      const journeyUser = await User.findById(journey.userId._id);
      if (!journeyUser.assignedTo || journeyUser.assignedTo.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view journeys from users assigned to you.'
        });
      }
    }
    // Super Admin can see any journey

    res.json({
      success: true,
      data: { journey }
    });
  } catch (error) {
    console.error('Get journey error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve journey',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all journeys with pagination and filters
 * GET /api/journeys
 * @access Private
 * @description
 * - Super Admin can see all journeys
 * - Admin can only see journeys from users assigned to them
 * - Users can only see their own journeys
 */
const getAllJourneys = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, userId: filterUserId, startDate, endDate } = req.query;
    const currentUserId = req.user.id;
    const userRole = req.user.role;

    console.log('getAllJourneys called with:', {
      page,
      limit,
      status,
      filterUserId,
      startDate,
      endDate,
      currentUserId,
      userRole
    });

    // Build query
    const query = {};

    // RBAC: Role-based filtering
    if (userRole === 'user') {
      // Users can only see their own journeys
      query.userId = currentUserId;
    } else if (userRole === 'admin') {
      // Admin can only see journeys from users assigned to them
      const User = require('../models/User');
      const assignedUsers = await User.find({ assignedTo: currentUserId }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id);

      if (filterUserId) {
        // If filtering by specific user, verify they're assigned to this admin
        if (!assignedUserIds.some(id => id.toString() === filterUserId)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. You can only view journeys from users assigned to you.'
          });
        }
        query.userId = filterUserId;
      } else {
        // Show all journeys from assigned users
        query.userId = { $in: assignedUserIds };
      }
    } else if (userRole === 'superadmin') {
      // Super Admin can see all journeys
      if (filterUserId) {
        query.userId = filterUserId;
      }
      // No filter = see all
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.startTimestamp = {};
      if (startDate) {
        query.startTimestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.startTimestamp.$lte = new Date(endDate);
      }
    }

    console.log('Final query:', JSON.stringify(query, null, 2));

    const skip = (page - 1) * limit;

    const journeys = await Journey.find(query)
      .populate('userId', 'name email employeeId')
      .populate({
        path: 'expenseId',
        select: 'systemDistance manualDistance approvedAmount status'
      })
      .sort({ startTimestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Journey.countDocuments(query);

    console.log(`Found ${journeys.length} journeys out of ${total} total`);

    // Calculate totals
    const totals = await Journey.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalDistance: { $sum: '$calculatedDistance' },
          totalJourneys: { $sum: 1 }
        }
      }
    ]);

    const stats = totals[0] || { totalDistance: 0, totalJourneys: 0 };

    res.json({
      success: true,
      data: {
        journeys,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        stats: {
          totalDistance: parseFloat(stats.totalDistance?.toFixed(2) || 0),
          totalJourneys: stats.totalJourneys,
          averageDistance: stats.totalJourneys > 0
            ? parseFloat((stats.totalDistance / stats.totalJourneys).toFixed(2))
            : 0
        }
      }
    });
  } catch (error) {
    console.error('Get journeys error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve journeys',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Cancel an active journey
 * PUT /api/journeys/:id/cancel
 * @access Private
 */
const cancelJourney = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    const journey = await Journey.findById(id);

    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Journey not found'
      });
    }

    // Check ownership
    if (journey.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only cancel your own journeys'
      });
    }

    // Check if journey is active
    if (journey.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: `Journey is already ${journey.status}`
      });
    }

    // Cancel journey
    await journey.cancel(reason);

    // Create audit log
    await Audit.log({
      action: 'journey_cancelled',
      performedBy: userId,
      targetUser: userId,
      metadata: {
        journeyId: journey._id,
        reason
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Journey cancelled successfully',
      data: { journey }
    });
  } catch (error) {
    console.error('Cancel journey error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel journey',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get active journey for current user
 * GET /api/journeys/active
 * @access Private
 */
const getActiveJourney = async (req, res) => {
  try {
    const userId = req.user.id;

    const journey = await Journey.findActiveJourney(userId);

    if (!journey) {
      return res.json({
        success: true,
        data: { journey: null },
        message: 'No active journey found'
      });
    }

    res.json({
      success: true,
      data: { journey }
    });
  } catch (error) {
    console.error('Get active journey error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve active journey',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  startJourney,
  endJourney,
  getJourneyById,
  getAllJourneys,
  cancelJourney,
  getActiveJourney
};

