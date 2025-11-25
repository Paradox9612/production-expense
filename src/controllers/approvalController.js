/**
 * Approval Controller
 * Handles expense approval/rejection workflow with balance updates
 */

const Expense = require('../models/Expense');
const User = require('../models/User');
const Journey = require('../models/Journey');
const MonthLock = require('../models/MonthLock');
const Audit = require('../models/Audit');
const { calculateApprovedAmount } = require('../utils/varianceCalculator');

/**
 * Approve an expense
 * POST /api/expenses/:id/approve
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @description
 * - Super Admin can approve any expense
 * - Admin can only approve expenses from users assigned to them
 */
const approveExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.userId;
    const userRole = req.user.role;
    const { approvedOption, adminDistance, adminNotes } = req.body;

    // Only admins and superadmins can approve
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins and super admins can approve expenses'
      });
    }

    // Find expense
    const expense = await Expense.findById(id).populate('userId').populate('journeyId');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // RBAC: Check if admin has access to this expense
    if (userRole === 'admin') {
      // Admin can only approve expenses from users assigned to them
      const expenseUser = await User.findById(expense.userId._id);
      if (!expenseUser.assignedTo || expenseUser.assignedTo.toString() !== adminId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only approve expenses from users assigned to you.'
        });
      }
    }
    // Super Admin can approve any expense

    // Check if already approved or rejected
    if (expense.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Expense is already ${expense.status}`
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
        message: `Cannot approve expense for ${monthLock.monthName} ${year}. Month is locked.`
      });
    }

    // Calculate approved amount based on option
    let approvedAmount;
    
    if (expense.type === 'journey') {
      // For journey expenses, calculate based on distance
      try {
        approvedAmount = calculateApprovedAmount(expense, approvedOption, adminDistance);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
    } else {
      // For non-journey expenses, use the expense amount
      approvedAmount = expense.amount;
    }

    // Update expense
    expense.status = 'approved';
    expense.approvedAmount = approvedAmount;
    expense.approvedBy = adminId;
    expense.approvedAt = new Date();
    expense.adminNotes = adminNotes || '';

    // Set approvedOption only for journey expenses
    if (expense.type === 'journey') {
      expense.approvedOption = approvedOption;
      if (approvedOption === 3 && adminDistance !== undefined) {
        expense.adminDistance = adminDistance;
      }
    }

    await expense.save();

    let balanceUpdate = null;
    let journeyUpdate = null;

    // Handle journey-attached expenses (update journey total for tracking)
    if (expense.journeyId) {
      console.log(`[JOURNEY EXPENSE] Processing expense ${expense._id} with journeyId ${expense.journeyId}`);
      const journey = await Journey.findById(expense.journeyId);
      if (!journey) {
        console.error(`[JOURNEY EXPENSE] Journey not found: ${expense.journeyId} for expense ${expense._id}`);
        return res.status(404).json({
          success: false,
          message: 'Associated journey not found'
        });
      }

      const previousJourneyTotal = journey.additionalExpensesTotal || 0;
      journey.additionalExpensesTotal = previousJourneyTotal + approvedAmount;
      await journey.save();

      journeyUpdate = {
        journeyId: journey._id,
        previousTotal: previousJourneyTotal,
        newTotal: journey.additionalExpensesTotal,
        addedAmount: approvedAmount
      };
      console.log(`[JOURNEY EXPENSE] Updated journey ${journey._id}: ${previousJourneyTotal} → ${journey.additionalExpensesTotal}`);
    }

    // Deduct from user balance for ALL approved expenses (journey and regular)
    console.log(`[BALANCE DEDUCTION] Processing expense ${expense._id} - deducting ₹${approvedAmount} from user balance`);
    const user = await User.findById(expense.userId._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const previousBalance = user.advanceBalance;
    const newBalance = previousBalance - approvedAmount;

    // Allow negative balances - no restrictions
    user.advanceBalance = newBalance;
    await user.save();

    balanceUpdate = {
      previous: previousBalance,
      current: user.advanceBalance,
      deducted: approvedAmount
    };

    // Audit log
    const auditMetadata = {
      expenseId: expense._id,
      approvedOption,
      approvedAmount,
      adminDistance,
      adminNotes,
      isJourneyExpense: !!expense.journeyId
    };

    if (journeyUpdate) {
      auditMetadata.journeyUpdate = journeyUpdate;
    } else if (balanceUpdate) {
      auditMetadata.balanceUpdate = balanceUpdate;
    }

    await Audit.log({
      action: 'expense_approved',
      performedBy: adminId,
      targetUser: expense.userId._id,
      metadata: auditMetadata,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Populate approver info
    await expense.populate('approvedBy', 'name email');

    const responseData = {
      expense,
      isJourneyExpense: !!expense.journeyId
    };

    if (journeyUpdate) {
      responseData.journeyUpdate = journeyUpdate;
    } else if (balanceUpdate) {
      responseData.userBalance = balanceUpdate;
    }

    res.json({
      success: true,
      message: 'Expense approved successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Approve expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve expense',
      error: error.message
    });
  }
};

/**
 * Reject an expense
 * POST /api/expenses/:id/reject
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @description
 * - Super Admin can reject any expense
 * - Admin can only reject expenses from users assigned to them
 */
const rejectExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.userId;
    const userRole = req.user.role;
    const { rejectionReason } = req.body;

    // Only admins and superadmins can reject
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins and super admins can reject expenses'
      });
    }

    // Find expense
    const expense = await Expense.findById(id).populate('userId').populate('journeyId');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // RBAC: Check if admin has access to this expense
    if (userRole === 'admin') {
      // Admin can only reject expenses from users assigned to them
      const expenseUser = await User.findById(expense.userId._id);
      if (!expenseUser.assignedTo || expenseUser.assignedTo.toString() !== adminId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only reject expenses from users assigned to you.'
        });
      }
    }
    // Super Admin can reject any expense

    // Check if already approved or rejected
    if (expense.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Expense is already ${expense.status}`
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
        message: `Cannot reject expense for ${monthLock.monthName} ${year}. Month is locked.`
      });
    }

    // Update expense
    expense.status = 'rejected';
    expense.rejectionReason = rejectionReason;
    expense.approvedBy = adminId;
    expense.approvedAt = new Date();

    await expense.save();

    // Audit log
    await Audit.log({
      action: 'expense_rejected',
      performedBy: adminId,
      targetUser: expense.userId._id,
      metadata: {
        expenseId: expense._id,
        rejectionReason,
        amount: expense.amount
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Populate approver info
    await expense.populate('approvedBy', 'name email');

    res.json({
      success: true,
      message: 'Expense rejected successfully',
      data: expense
    });
  } catch (error) {
    console.error('Reject expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject expense',
      error: error.message
    });
  }
};

/**
 * Bulk approve expenses
 * POST /api/expenses/bulk-approve
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @description
 * - Super Admin can bulk approve any expenses
 * - Admin can only bulk approve expenses from users assigned to them
 */
const bulkApproveExpenses = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const userRole = req.user.role;
    const { expenseIds, approvedOption = 1, adminNotes, maxVariance } = req.body; // Default to option 1 (system distance)


    // Only admins and superadmins can bulk approve
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins and super admins can bulk approve expenses'
      });
    }

    // Validate expense IDs
    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Expense IDs array is required and must not be empty'
      });
    }

    // Find all expenses
    const expenses = await Expense.find({
      _id: { $in: expenseIds },
      status: 'pending'
    }).populate('userId').populate('journeyId');

    if (expenses.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No pending expenses found with the provided IDs'
      });
    }

    // RBAC: Filter expenses based on role
    let accessibleExpenses = expenses;
    if (userRole === 'admin') {
      // Admin can only approve expenses from users assigned to them
      const assignedUsers = await User.find({ assignedTo: adminId }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id.toString());

      accessibleExpenses = expenses.filter(expense => {
        return assignedUserIds.includes(expense.userId._id.toString());
      });

      if (accessibleExpenses.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. None of the selected expenses belong to users assigned to you.'
        });
      }

      if (accessibleExpenses.length < expenses.length) {
        console.log(`Admin ${adminId} attempted to approve ${expenses.length} expenses but only has access to ${accessibleExpenses.length}`);
      }
    }
    // Super Admin can approve all expenses (no filtering needed)

    // Filter expenses by variance if maxVariance is specified
    let filteredExpenses = accessibleExpenses;
    if (maxVariance !== undefined && maxVariance !== null) {
      const varianceThreshold = parseFloat(maxVariance);
      if (!isNaN(varianceThreshold) && varianceThreshold >= 0) {
        filteredExpenses = accessibleExpenses.filter(expense => {
          // Only filter journey expenses (non-journey expenses don't have variance)
          if (expense.type !== 'journey') {
            return true; // Include non-journey expenses
          }

          // Calculate variance for journey expenses
          if (expense.systemDistance && expense.manualDistance !== undefined) {
            const variance = Math.abs(expense.manualDistance - expense.systemDistance) / expense.systemDistance * 100;
            return variance <= varianceThreshold;
          }

          // If we can't calculate variance, include the expense (system distance might be 0 or manual distance missing)
          return true;
        });

        console.log(`Filtered ${accessibleExpenses.length} expenses down to ${filteredExpenses.length} based on variance ≤ ${varianceThreshold}%`);
      }
    }

    const results = {
      approved: [],
      failed: [],
      totalApproved: 0,
      totalFailed: 0,
      totalAmount: 0
    };

    // Process each filtered expense
    for (const expense of filteredExpenses) {
      try {
        // Check if month is locked
        const expenseDate = expense.date;
        const year = expenseDate.getFullYear();
        const month = expenseDate.getMonth() + 1;

        const monthLock = await MonthLock.findOne({ year, month });
        if (monthLock && monthLock.isLocked) {
          results.failed.push({
            expenseId: expense._id,
            reason: `Month ${monthLock.monthName} ${year} is locked`
          });
          results.totalFailed++;
          continue;
        }

        // Calculate approved amount
        let approvedAmount;

        try {
          if (expense.type === 'journey') {
            approvedAmount = calculateApprovedAmount(expense, approvedOption);
          } else {
            // For non-journey expenses, use the expense amount directly
            approvedAmount = parseFloat(expense.amount) || 0;
          }
        } catch (error) {
          results.failed.push({
            expenseId: expense._id,
            reason: error.message
          });
          results.totalFailed++;
          continue;
        }

        // Update expense
        expense.status = 'approved';
        expense.approvedOption = approvedOption;
        expense.approvedAmount = approvedAmount;
        expense.approvedBy = adminId;
        expense.approvedAt = new Date();
        expense.adminNotes = adminNotes || '';
        expense.bulkApproved = true; // Mark as bulk approved

        await expense.save();

        // Handle journey-attached expenses (update journey total for tracking)
        if (expense.journeyId) {
          console.log(`[BULK JOURNEY EXPENSE] Processing expense ${expense._id} with journeyId ${expense.journeyId}`);
          const journey = await Journey.findById(expense.journeyId);
          if (journey) {
            const previousJourneyTotal = journey.additionalExpensesTotal || 0;
            journey.additionalExpensesTotal = previousJourneyTotal + approvedAmount;
            await journey.save();

            console.log(`[BULK JOURNEY EXPENSE] Updated journey ${journey._id}: ${previousJourneyTotal} → ${journey.additionalExpensesTotal}`);
          } else {
            console.error(`[BULK JOURNEY EXPENSE] Journey not found: ${expense.journeyId} for expense ${expense._id}`);
          }
        }

        // Deduct from user balance for ALL approved expenses (journey and regular)
        console.log(`[BULK BALANCE DEDUCTION] Processing expense ${expense._id} - deducting ₹${approvedAmount} from user balance`);
        const user = await User.findById(expense.userId._id);
        if (user) {
          const previousBalance = user.advanceBalance;
          const newBalance = previousBalance - approvedAmount;

          // Allow negative balances - no restrictions
          user.advanceBalance = newBalance;
          await user.save();

          // Audit log
          await Audit.log({
            action: 'expense_bulk_approved',
            performedBy: adminId,
            targetUser: expense.userId._id,
            metadata: {
              expenseId: expense._id,
              approvedOption: expense.type === 'journey' ? approvedOption : null,
              approvedAmount,
              adminNotes,
              isJourneyExpense: !!expense.journeyId,
              journeyUpdate: expense.journeyId ? {
                journeyId: expense.journeyId,
                addedAmount: approvedAmount
              } : undefined,
              balanceUpdate: {
                previous: previousBalance,
                current: user.advanceBalance,
                deducted: approvedAmount
              }
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          });

          results.approved.push({
            expenseId: expense._id,
            userId: expense.userId._id,
            approvedAmount,
            isJourneyExpense: !!expense.journeyId,
            journeyUpdate: expense.journeyId ? {
              journeyId: expense.journeyId,
              addedAmount: approvedAmount
            } : undefined,
            balanceUpdate: {
              previous: previousBalance,
              current: user.advanceBalance,
              deducted: approvedAmount
            }
          });
          results.totalApproved++;
          results.totalAmount += approvedAmount;
        } else {
          results.failed.push({
            expenseId: expense._id,
            reason: 'User not found'
          });
          results.totalFailed++;
        }
      } catch (error) {
        console.error('Error processing expense:', expense._id, error);
        let reason = error.message;

        // If it's a validation error, get the specific field errors
        if (error.name === 'ValidationError') {
          const validationErrors = Object.values(error.errors).map(err => err.message);
          reason = `Validation failed: ${validationErrors.join(', ')}`;
        }

        results.failed.push({
          expenseId: expense._id,
          reason: reason
        });
        results.totalFailed++;
      }
    }

    const filteredCount = expenses.length - filteredExpenses.length;
    const message = filteredCount > 0
      ? `Bulk approval completed. ${results.totalApproved} approved, ${results.totalFailed} failed. ${filteredCount} expenses filtered out by variance threshold.`
      : `Bulk approval completed. ${results.totalApproved} approved, ${results.totalFailed} failed.`;

    res.json({
      success: true,
      message,
      data: {
        ...results,
        totalFiltered: filteredCount,
        maxVariance: maxVariance !== undefined ? parseFloat(maxVariance) : null
      }
    });
  } catch (error) {
    console.error('Bulk approve error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk approve expenses',
      error: error.message
    });
  }
};

module.exports = {
  approveExpense,
  rejectExpense,
  bulkApproveExpenses
};

