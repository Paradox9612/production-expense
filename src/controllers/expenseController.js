/**
 * Expense Controller
 * Handles CRUD operations for expenses with advanced filtering and variance calculation
 */

const Expense = require('../models/Expense');
const Journey = require('../models/Journey');
const User = require('../models/User');
const Audit = require('../models/Audit');
const MonthLock = require('../models/MonthLock');
const Settings = require('../models/Settings');
const { calculateVarianceWithCategory } = require('../utils/varianceCalculator');

/**
 * Create a new expense
 * POST /api/expenses
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const createExpense = async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      type,
      expenseCategory,
      date,
      description,
      amount,
      journeyId,
      startCoordinates,
      endCoordinates,
      startAddress,
      endAddress,
      systemDistance,
      manualDistance,
      gpsOffline,
      distanceRate,
      attachments
    } = req.body;

    // Check if month is locked
    const expenseDate = date ? new Date(date) : new Date();
    const year = expenseDate.getFullYear();
    const month = expenseDate.getMonth() + 1;

    const monthLock = await MonthLock.findOne({ year, month });
    if (monthLock && monthLock.isLocked) {
      return res.status(400).json({
        success: false,
        message: `Cannot create expense for ${monthLock.monthName} ${year}. Month is locked.`,
        data: { lockedBy: monthLock.lockedBy, lockedAt: monthLock.lockedAt }
      });
    }

    // Validate expenseCategory and journeyId
    const category = expenseCategory || 'general'; // Default to general for backward compatibility

    if (category === 'journey' && !journeyId) {
      return res.status(400).json({
        success: false,
        message: 'Journey ID is required when expense category is journey'
      });
    }

    // If journey category or legacy journey type, validate journey
    if ((category === 'journey' || type === 'journey') && journeyId) {
      const journey = await Journey.findById(journeyId);
      if (!journey) {
        return res.status(404).json({
          success: false,
          message: 'Journey not found'
        });
      }

      // Check if journey belongs to user
      if (journey.userId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to create expense for this journey'
        });
      }

      // Check if journey already has an expense - if so, update it instead of creating new
      if (journey.expenseId) {
        const existingExpense = await Expense.findById(journey.expenseId);
        if (existingExpense) {
          // Update existing expense by adding the new amount
          existingExpense.amount += amount;
          await existingExpense.save();

          // Audit log for update
          await Audit.log({
            action: 'expense_updated',
            performedBy: userId,
            targetUser: userId,
            metadata: {
              expenseId: existingExpense._id,
              journeyId: journeyId,
              addedAmount: amount,
              newTotalAmount: existingExpense.amount
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });

          return res.status(200).json({
            success: true,
            message: 'Expense added to existing journey expense',
            data: existingExpense
          });
        }
      }
    }

    // Create expense
    const expense = new Expense({
      userId,
      type,
      expenseCategory: category,
      date: expenseDate,
      description,
      amount,
      journeyId: (category === 'journey' || type === 'journey') ? journeyId : undefined,
      startCoordinates: type === 'journey' ? startCoordinates : undefined,
      endCoordinates: type === 'journey' ? endCoordinates : undefined,
      startAddress: type === 'journey' ? startAddress : undefined,
      endAddress: type === 'journey' ? endAddress : undefined,
      systemDistance: type === 'journey' ? systemDistance : undefined,
      manualDistance: type === 'journey' ? manualDistance : undefined,
      gpsOffline: type === 'journey' ? gpsOffline : undefined,
      distanceRate: type === 'journey' ? distanceRate : undefined,
      attachments: attachments || [],
      status: 'pending'
    });

    await expense.save();

    // Populate user info
    await expense.populate('userId', 'name email employeeId');

    // Audit log
    await Audit.log({
      action: 'expense_created',
      performedBy: userId,
      targetUser: userId,
      metadata: {
        expenseId: expense._id,
        type,
        amount,
        description
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: expense
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message
    });
  }
};

/**
 * Get all expenses with advanced filtering
 * GET /api/expenses
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @description
 * - Super Admin can see all expenses
 * - Admin can only see expenses from users assigned to them
 * - Users can only see their own expenses
 */
const getAllExpenses = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    const {
      page = 1,
      limit = 10,
      userId: filterUserId,
      type,
      status,
      dateFrom,
      dateTo,
      varianceMin,
      varianceMax,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};

    // RBAC: Role-based filtering
    if (userRole === 'user') {
      // Users can only see their own expenses
      query.userId = userId;
    } else if (userRole === 'admin') {
      // Admin can only see expenses from users assigned to them
      // First, get all users assigned to this admin
      const assignedUsers = await User.find({ assignedTo: userId }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id);

      if (filterUserId) {
        // If filtering by specific user, verify they're assigned to this admin
        if (!assignedUserIds.some(id => id.toString() === filterUserId)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. You can only view expenses from users assigned to you.'
          });
        }
        query.userId = filterUserId;
      } else {
        // Show all expenses from assigned users
        query.userId = { $in: assignedUserIds };
      }
    } else if (userRole === 'superadmin') {
      // Super Admin can see all expenses
      if (filterUserId) {
        query.userId = filterUserId;
      }
      // No filter = see all
    }

    // Filter by type
    if (type) {
      query.type = type;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) {
        query.date.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        query.date.$lte = new Date(dateTo);
      }
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    let expenses = await Expense.find(query)
      .populate('userId', 'name email employeeId')
      .populate('journeyId')
      .populate('approvedBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Filter by variance if specified (post-query filtering)
    if (varianceMin !== undefined || varianceMax !== undefined) {
      expenses = expenses.filter(expense => {
        if (expense.type !== 'journey' || !expense.systemDistance) {
          return false;
        }

        const varianceData = calculateVarianceWithCategory(
          expense.systemDistance,
          expense.manualDistance || 0
        );

        const variance = varianceData.variance;

        if (varianceMin !== undefined && variance < parseFloat(varianceMin)) {
          return false;
        }

        if (varianceMax !== undefined && variance > parseFloat(varianceMax)) {
          return false;
        }

        return true;
      });
    }

    // Add variance data to journey expenses
    expenses = expenses.map(expense => {
      if (expense.type === 'journey' && expense.systemDistance) {
        const varianceData = calculateVarianceWithCategory(
          expense.systemDistance,
          expense.manualDistance || 0
        );
        return {
          ...expense,
          variancePercentage: varianceData.variance,
          varianceCategory: varianceData.category
        };
      }
      return expense;
    });

    // Get total count
    const total = await Expense.countDocuments(query);

    // Calculate statistics
    const stats = await Expense.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalExpenses: { $sum: 1 },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approvedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          }
        }
      }
    ]);

    const statistics = stats[0] || {
      totalAmount: 0,
      totalExpenses: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0
    };

    res.json({
      success: true,
      data: {
        expenses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        stats: statistics
      }
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve expenses',
      error: error.message
    });
  }
};

/**
 * Get expense by ID
 * GET /api/expenses/:id
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getExpenseById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const expense = await Expense.findById(id)
      .populate('userId', 'name email employeeId role')
      .populate('journeyId')
      .populate('approvedBy', 'name email')
      .lean();

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check permission
    if (userRole !== 'admin' && expense.userId._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this expense'
      });
    }

    // Add variance data for journey expenses
    if (expense.type === 'journey' && expense.systemDistance) {
      const varianceData = calculateVarianceWithCategory(
        expense.systemDistance,
        expense.manualDistance || 0
      );
      expense.variancePercentage = varianceData.variance;
      expense.varianceCategory = varianceData.category;
    }

    res.json({
      success: true,
      data: expense
    });
  } catch (error) {
    console.error('Get expense by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve expense',
      error: error.message
    });
  }
};

/**
 * Update expense
 * PUT /api/expenses/:id
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { type, date, description, amount, manualDistance, attachments } = req.body;

    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check permission
    if (userRole !== 'admin' && expense.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this expense'
      });
    }

    // Cannot update approved or rejected expenses
    if (expense.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot update ${expense.status} expense. Only pending expenses can be updated.`
      });
    }

    // Check if month is locked
    const expenseDate = expense.date;
    const year = expenseDate.getFullYear();
    const month = expenseDate.getMonth() + 1;

    const monthLock = await MonthLock.findOne({ year, month });
    if (monthLock && monthLock.isLocked) {
      return res.status(400).json({
        success: false,
        message: `Cannot update expense for ${monthLock.monthName} ${year}. Month is locked.`
      });
    }

    // Update fields
    if (type !== undefined) expense.type = type;
    if (date !== undefined) expense.date = new Date(date);
    if (description !== undefined) expense.description = description;
    if (amount !== undefined) expense.amount = amount;
    if (manualDistance !== undefined && expense.type === 'journey') {
      expense.manualDistance = manualDistance;
    }
    if (attachments !== undefined) expense.attachments = attachments;

    await expense.save();

    // Populate user info
    await expense.populate('userId', 'name email employeeId');

    // Audit log
    await Audit.log({
      action: 'expense_updated',
      performedBy: userId,
      targetUser: expense.userId._id,
      metadata: {
        expenseId: expense._id,
        updates: { type, date, description, amount, manualDistance, attachments }
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: expense
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense',
      error: error.message
    });
  }
};

/**
 * Delete expense
 * DELETE /api/expenses/:id
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check permission
    if (userRole !== 'admin' && expense.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this expense'
      });
    }

    // Cannot delete approved expenses
    if (expense.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete approved expense'
      });
    }

    // Check if month is locked
    const expenseDate = expense.date;
    const year = expenseDate.getFullYear();
    const month = expenseDate.getMonth() + 1;

    const monthLock = await MonthLock.findOne({ year, month });
    if (monthLock && monthLock.isLocked) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete expense for ${monthLock.monthName} ${year}. Month is locked.`
      });
    }

    await expense.deleteOne();

    // Audit log
    await Audit.log({
      action: 'expense_deleted',
      performedBy: userId,
      targetUser: expense.userId,
      metadata: {
        expenseId: expense._id,
        type: expense.type,
        amount: expense.amount,
        description: expense.description
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error.message
    });
  }
};

/**
 * Get journey expense totals
 * GET /api/expenses/journey/:journeyId/total
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @description
 * Returns the total expenses for a specific journey including:
 * - Sum of all approved expenses for the journey
 * - Optionally includes current pending expense if expenseId is provided
 */
const getJourneyExpenseTotal = async (req, res) => {
  try {
    const { journeyId } = req.params;
    const { includeExpenseId } = req.query; // Optional: include a specific pending expense
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Validate journey exists and user has access
    const journey = await Journey.findById(journeyId);
    if (!journey) {
      return res.status(404).json({
        success: false,
        message: 'Journey not found'
      });
    }

    // RBAC: Check if user has access to this journey
    if (userRole === 'user' && journey.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this journey'
      });
    } else if (userRole === 'admin') {
      // Admin can only view journeys from users assigned to them
      const assignedUsers = await User.find({ assignedTo: userId }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id.toString());
      if (!assignedUserIds.includes(journey.userId.toString())) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view journeys from users assigned to you.'
        });
      }
    }
    // Super Admin can view all journeys

    // Calculate total from approved expenses for this journey
    const approvedTotalResult = await Expense.aggregate([
      {
        $match: {
          journeyId: journey._id,
          status: 'approved'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$approvedAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const approvedTotal = approvedTotalResult.length > 0 ? approvedTotalResult[0].total : 0;
    const approvedCount = approvedTotalResult.length > 0 ? approvedTotalResult[0].count : 0;

    // Include pending expense if specified
    let pendingAmount = 0;
    let pendingExpense = null;
    if (includeExpenseId) {
      const expense = await Expense.findOne({
        _id: includeExpenseId,
        journeyId: journey._id,
        status: 'pending'
      });

      if (expense) {
        // Calculate the approved amount for pending expense based on current logic
        if (expense.type === 'journey') {
          // For journey expenses, approved amount includes distance calculation
          // Use expense's distanceRate if available, otherwise fetch current rate from Settings
          const ratePerKm = expense.distanceRate || await Settings.getRatePerKm();
          let distanceCost = 0;

          // Use approved option if set, otherwise default to option 1
          const approvedOption = expense.approvedOption || 1;
          if (approvedOption === 1) {
            distanceCost = (expense.systemDistance || 0) * ratePerKm;
          } else if (approvedOption === 2) {
            distanceCost = (expense.manualDistance || 0) * ratePerKm;
          } else if (approvedOption === 3) {
            distanceCost = (expense.adminDistance || 0) * ratePerKm;
          }

          pendingAmount = expense.amount + distanceCost;
        } else {
          pendingAmount = expense.amount;
        }
        pendingExpense = expense;
      }
    }

    const totalAmount = approvedTotal + pendingAmount;

    res.json({
      success: true,
      message: 'Journey expense total retrieved successfully',
      data: {
        journeyId: journey._id,
        journeyName: journey.name,
        approvedTotal,
        approvedCount,
        pendingAmount,
        pendingExpenseId: pendingExpense?._id,
        totalAmount,
        breakdown: {
          approved: approvedTotal,
          pending: pendingAmount,
          total: totalAmount
        }
      }
    });

  } catch (error) {
    console.error('Get journey expense total error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve journey expense total',
      error: error.message
    });
  }
};

module.exports = {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  getJourneyExpenseTotal
};

