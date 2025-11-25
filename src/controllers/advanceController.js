/**
 * Advance Controller
 * Handles advance payment operations and balance management
 */

const Advance = require('../models/Advance');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Audit = require('../models/Audit');

/**
 * Add advance payment to employee
 * POST /api/advances
 * Admin and Super Admin only
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Created advance and updated balance
 * @throws {Error} If validation fails or user not found
 * @description
 * - Super Admin can add advance to any user
 * - Admin can only add advance to users assigned to them
 */
const addAdvance = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const userRole = req.user.role;
    const { userId, amount, proofUrl, notes, description, paymentMethod, transactionReference } = req.body;

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // RBAC: Check if admin has access to this user
    if (userRole === 'admin') {
      // Admin can only add advance to users assigned to them
      if (!user.assignedTo || user.assignedTo.toString() !== adminId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only add advances to users assigned to you.'
        });
      }
    }
    // Super Admin can add advance to any user

    // Create advance record
    const advance = new Advance({
      userId,
      amount,
      proofUrl,
      notes,
      description,
      paymentMethod: paymentMethod || 'bank_transfer',
      transactionReference,
      addedBy: adminId,
      status: 'completed',
      date: new Date()
    });

    await advance.save();

    // Balance reconciliation logic
    const previousBalance = user.advanceBalance || 0;
    let reconciledAmount = amount;
    let reconciliationNote = '';

    // If user has negative balance, reconcile it
    if (previousBalance < 0) {
      // Calculate how much of the added amount goes to covering negative balance
      const negativeAmount = Math.abs(previousBalance);
      reconciledAmount = amount; // Keep original amount for record, but track reconciliation

      // The actual balance addition will bring them towards positive
      // No restrictions on negative balances - allow them to remain negative if needed
      reconciliationNote = `Previous balance: ₹${previousBalance}. Added: ₹${amount}. `;

      if (previousBalance + amount >= 0) {
        reconciliationNote += `Cleared negative balance and added ₹${(previousBalance + amount).toFixed(2)} surplus.`;
      } else {
        reconciliationNote += `Added to negative balance. New balance: ₹${(previousBalance + amount).toFixed(2)}.`;
      }
    } else {
      reconciliationNote = `Added ₹${amount} to existing balance of ₹${previousBalance}.`;
    }

    // Update user's advance balance (allow negative balances)
    user.advanceBalance = previousBalance + amount;
    await user.save();

    // Create audit record
    await Audit.log({
      action: 'advance_added',
      performedBy: adminId,
      targetUser: userId,
      metadata: {
        advanceId: advance._id,
        amount,
        reconciledAmount,
        previousBalance,
        newBalance: user.advanceBalance,
        paymentMethod: advance.paymentMethod,
        reconciliationNote,
        notes
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Populate admin details
    await advance.populate('addedBy', 'name email employeeId');
    await advance.populate('userId', 'name email employeeId advanceBalance');

    res.status(201).json({
      success: true,
      message: 'Advance payment added successfully',
      data: {
        advance,
        previousBalance,
        newBalance: user.advanceBalance,
        reconciledAmount,
        reconciliationNote
      }
    });

  } catch (error) {
    console.error('Error in addAdvance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add advance payment',
      error: error.message
    });
  }
};

/**
 * Get all advances with filters
 * GET /api/advances
 * Admin and Super Admin only
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} List of advances with pagination
 * @description
 * - Super Admin can see all advances
 * - Admin can only see advances from users assigned to them
 */
const getAdvances = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const userRole = req.user.role;
    const {
      userId,
      status,
      dateFrom,
      dateTo,
      paymentMethod,
      page = 1,
      limit = 10,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = { isDeleted: false };

    // RBAC: Role-based filtering
    if (userRole === 'admin') {
      // Admin can only see advances from users assigned to them
      const assignedUsers = await User.find({ assignedTo: adminId }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id);

      if (userId) {
        // If filtering by specific user, verify they're assigned to this admin
        if (!assignedUserIds.some(id => id.toString() === userId)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. You can only view advances from users assigned to you.'
          });
        }
        filter.userId = userId;
      } else {
        // Show all advances from assigned users
        filter.userId = { $in: assignedUserIds };
      }
    } else if (userRole === 'superadmin') {
      // Super Admin can see all advances
      if (userId) filter.userId = userId;
      // No filter = see all
    }

    if (status) filter.status = status;
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    // Date range filter
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = new Date(dateFrom);
      if (dateTo) filter.date.$lte = new Date(dateTo);
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [advances, total] = await Promise.all([
      Advance.find(filter)
        .populate('userId', 'name email employeeId advanceBalance')
        .populate('addedBy', 'name email employeeId')
        .sort(sort)
        .skip(skip)
        .limit(limitNum),
      Advance.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      message: 'Advances retrieved successfully',
      data: {
        advances,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum)
        }
      }
    });

  } catch (error) {
    console.error('Error in getAdvances:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve advances',
      error: error.message
    });
  }
};

/**
 * Get advance history for a specific user with running balance
 * GET /api/advances/user/:userId
 * Admin and user (own data only)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} User's advance history with transaction details
 */
const getAdvanceHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.user.userId;
    const requestingUserRole = req.user.role;

    // Check authorization: admin can view any user, user can only view own data
    if (requestingUserRole !== 'admin' && requestingUserId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this user\'s advance history'
      });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get all advances for user
    const advances = await Advance.find({
      userId,
      status: 'completed',
      isDeleted: false
    })
      .populate('addedBy', 'name email employeeId')
      .sort({ date: 1 }); // Ascending order for running balance

    // Get all approved expenses for user
    const expenses = await Expense.find({
      userId,
      status: 'approved'
    })
      .select('date approvedAmount description type')
      .sort({ date: 1 });

    // Calculate running balance and create transaction history
    let runningBalance = 0;
    const transactions = [];

    // Combine advances and expenses, sort by date
    const allTransactions = [
      ...advances.map(adv => ({
        type: 'advance',
        date: adv.date,
        amount: adv.amount,
        description: adv.description || adv.notes || 'Advance payment',
        reference: adv._id,
        addedBy: adv.addedBy,
        paymentMethod: adv.paymentMethod,
        transactionReference: adv.transactionReference,
        proofUrl: adv.proofUrl
      })),
      ...expenses.map(exp => ({
        type: 'expense',
        date: exp.date,
        amount: -exp.approvedAmount, // Negative for expenses
        description: exp.description,
        reference: exp._id,
        expenseType: exp.type
      }))
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate running balance for each transaction
    allTransactions.forEach(transaction => {
      runningBalance += transaction.amount;
      transactions.push({
        ...transaction,
        runningBalance
      });
    });

    // Calculate current balance
    const currentBalance = await calculateBalance(userId);

    // Get summary statistics
    const totalAdvances = advances.reduce((sum, adv) => sum + adv.amount, 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.approvedAmount, 0);

    res.status(200).json({
      success: true,
      message: 'Advance history retrieved successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          employeeId: user.employeeId,
          currentBalance: user.advanceBalance
        },
        summary: {
          totalAdvances,
          totalExpenses,
          currentBalance,
          advanceCount: advances.length,
          expenseCount: expenses.length
        },
        transactions
      }
    });

  } catch (error) {
    console.error('Error in getAdvanceHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve advance history',
      error: error.message
    });
  }
};

/**
 * Calculate current balance for a user
 * Balance = Total Advances - Total Approved Expenses
 *
 * @param {String} userId - User ID
 * @returns {Number} Current balance
 */
const calculateBalance = async (userId) => {
  try {
    // Get all completed advances
    const advances = await Advance.find({
      userId,
      status: 'completed',
      isDeleted: false
    }).select('amount');
    const totalAdvances = advances.reduce((sum, adv) => sum + adv.amount, 0);

    // Get all approved expenses
    const expenses = await Expense.find({
      userId,
      status: 'approved'
    }).select('approvedAmount');
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.approvedAmount, 0);

    return totalAdvances - totalExpenses;
  } catch (error) {
    console.error('Error in calculateBalance:', error);
    throw error;
  }
};

/**
 * Get advance by ID
 * GET /api/advances/:id
 * Admin and user (own data only)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Advance details
 */
const getAdvanceById = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user.userId;
    const requestingUserRole = req.user.role;

    const advance = await Advance.findById(id)
      .populate('userId', 'name email employeeId advanceBalance')
      .populate('addedBy', 'name email employeeId');

    if (!advance) {
      return res.status(404).json({
        success: false,
        message: 'Advance not found'
      });
    }

    // Check authorization
    if (requestingUserRole !== 'admin' && advance.userId._id.toString() !== requestingUserId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this advance'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Advance retrieved successfully',
      data: { advance }
    });

  } catch (error) {
    console.error('Error in getAdvanceById:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve advance',
      error: error.message
    });
  }
};

module.exports = {
  addAdvance,
  getAdvances,
  getAdvanceHistory,
  calculateBalance,
  getAdvanceById
};

