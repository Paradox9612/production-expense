/**
 * Dashboard Controller
 * Handles dashboard statistics and reports with MongoDB aggregation
 */

const User = require('../models/User');
const Expense = require('../models/Expense');
const Advance = require('../models/Advance');
const Journey = require('../models/Journey');
const mongoose = require('mongoose');

/**
 * Get admin dashboard statistics
 * GET /api/dashboard/admin
 * Admin and Super Admin only
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Dashboard statistics
 * @description
 * - Super Admin sees system-wide statistics
 * - Admin sees statistics only for users assigned to them
 */
const getAdminDashboard = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const userRole = req.user.role;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // RBAC: Get assigned user IDs for admin
    let assignedUserIds = [];
    if (userRole === 'admin') {
      const assignedUsers = await User.find({ assignedTo: adminId }).select('_id');
      assignedUserIds = assignedUsers.map(u => u._id);
    }

    // Build base filter for expenses
    const expenseFilter = {};
    if (userRole === 'admin') {
      expenseFilter.userId = { $in: assignedUserIds };
    }
    // Super Admin has no filter (sees all)

    // 1. Pending approvals count
    const pendingCount = await Expense.countDocuments({
      status: 'pending',
      ...expenseFilter
    });

    // 2. This month's total approved expenses
    const monthTotal = await Expense.aggregate([
      {
        $match: {
          status: 'approved',
          date: { $gte: monthStart, $lte: monthEnd },
          ...expenseFilter
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$approvedAmount' }
        }
      }
    ]);

    const thisMonthTotal = monthTotal.length > 0 ? monthTotal[0].total : 0;

    // 3. Top 5 spenders (this month)
    const topSpenders = await Expense.aggregate([
      {
        $match: {
          status: 'approved',
          date: { $gte: monthStart, $lte: monthEnd },
          ...expenseFilter
        }
      },
      {
        $group: {
          _id: '$userId',
          totalExpenses: { $sum: '$approvedAmount' },
          expenseCount: { $sum: 1 }
        }
      },
      {
        $sort: { totalExpenses: -1 }
      },
      {
        $limit: 5
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          userId: '$_id',
          name: '$user.name',
          email: '$user.email',
          employeeId: '$user.employeeId',
          totalExpenses: 1,
          expenseCount: 1
        }
      }
    ]);

    // 4. Low balance employees (balance < 0)
    const userFilter = {
      advanceBalance: { $lt: 0 },
      isActive: true,
      role: 'user'
    };
    if (userRole === 'admin') {
      userFilter._id = { $in: assignedUserIds };
    }

    const lowBalanceEmployees = await User.find(userFilter)
      .select('name email employeeId advanceBalance')
      .sort({ advanceBalance: 1 })
      .limit(10);

    // 5. Total employees
    const employeeFilter = { role: 'user', isActive: true };
    if (userRole === 'admin') {
      employeeFilter._id = { $in: assignedUserIds };
    }
    const totalEmployees = await User.countDocuments(employeeFilter);

    // 6. Total active journeys
    const journeyFilter = { status: 'active' };
    if (userRole === 'admin') {
      journeyFilter.userId = { $in: assignedUserIds };
    }
    const activeJourneys = await Journey.countDocuments(journeyFilter);

    // 7. This month's statistics
    const monthStats = {
      totalExpenses: thisMonthTotal,
      pendingExpenses: pendingCount,
      approvedExpenses: await Expense.countDocuments({
        status: 'approved',
        date: { $gte: monthStart, $lte: monthEnd },
        ...expenseFilter
      }),
      rejectedExpenses: await Expense.countDocuments({
        status: 'rejected',
        date: { $gte: monthStart, $lte: monthEnd },
        ...expenseFilter
      })
    };

    res.status(200).json({
      success: true,
      message: 'Admin dashboard data retrieved successfully',
      data: {
        overview: {
          pendingApprovals: pendingCount,
          thisMonthTotal,
          totalEmployees,
          activeJourneys
        },
        topSpenders,
        lowBalanceEmployees,
        monthStats
      }
    });

  } catch (error) {
    console.error('Error in getAdminDashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve admin dashboard data',
      error: error.message
    });
  }
};

/**
 * Get user dashboard statistics
 * GET /api/dashboard/user/:id
 * Admin, Super Admin, and user (own data only)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} User dashboard statistics
 * @description
 * - Super Admin can view any user's dashboard
 * - Admin can only view dashboards for users assigned to them
 * - Users can only view their own dashboard
 */
const getUserDashboard = async (req, res) => {
  try {
    const { id } = req.params;
    const requestingUserId = req.user.userId;
    const requestingUserRole = req.user.role;

    // RBAC: Check authorization
    if (requestingUserRole === 'user') {
      // Users can only view their own dashboard
      if (requestingUserId !== id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to view this dashboard'
        });
      }
    } else if (requestingUserRole === 'admin') {
      // Admin can only view dashboards for users assigned to them
      const targetUser = await User.findById(id);
      if (!targetUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!targetUser.assignedTo || targetUser.assignedTo.toString() !== requestingUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view dashboards for users assigned to you.'
        });
      }
    }
    // Super Admin can view any user's dashboard

    // Validate user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Current balance
    const currentBalance = user.advanceBalance;

    // 2. Pending expenses count and amount
    const pendingExpenses = await Expense.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(id),
          status: 'pending'
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ['$amount', 0] } }
        }
      }
    ]);

    const pending = pendingExpenses.length > 0 ? pendingExpenses[0] : { count: 0, totalAmount: 0 };

    // 3. Approved this month
    const approvedThisMonth = await Expense.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(id),
          status: 'approved',
          date: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: '$approvedAmount' }
        }
      }
    ]);

    const approved = approvedThisMonth.length > 0 ? approvedThisMonth[0] : { count: 0, totalAmount: 0 };

    // 4. Last 30 days trend (daily expenses)
    const last30DaysTrend = await Expense.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(id),
          status: 'approved',
          date: { $gte: last30Days }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            day: { $dayOfMonth: '$date' }
          },
          totalAmount: { $sum: '$approvedAmount' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          totalAmount: 1,
          count: 1
        }
      }
    ]);

    // Format trend data for charts
    const trendData = {
      labels: last30DaysTrend.map(item => item.date.toISOString().split('T')[0]),
      datasets: [
        {
          label: 'Daily Expenses',
          data: last30DaysTrend.map(item => item.totalAmount)
        }
      ]
    };

    // 5. Expense breakdown by type (this month)
    const expenseBreakdown = await Expense.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(id),
          status: 'approved',
          date: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$approvedAmount' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      message: 'User dashboard data retrieved successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          employeeId: user.employeeId,
          currentBalance
        },
        summary: {
          currentBalance,
          pendingExpenses: {
            count: pending.count,
            totalAmount: pending.totalAmount
          },
          approvedThisMonth: {
            count: approved.count,
            totalAmount: approved.totalAmount
          }
        },
        trendData,
        expenseBreakdown
      }
    });

  } catch (error) {
    console.error('Error in getUserDashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user dashboard data',
      error: error.message
    });
  }
};

/**
 * Get monthly summary for a user
 * GET /api/dashboard/monthly/:userId/:year/:month
 * Admin and user (own data only)
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Monthly summary with breakdown
 */
const getMonthSummary = async (req, res) => {
  try {
    const { userId, year, month } = req.params;
    const requestingUserId = req.user.userId;
    const requestingUserRole = req.user.role;

    // Check authorization
    if (requestingUserRole !== 'admin' && requestingUserId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this summary'
      });
    }

    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Parse year and month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year or month'
      });
    }

    const monthStart = new Date(yearNum, monthNum - 1, 1);
    const monthEnd = new Date(yearNum, monthNum, 0, 23, 59, 59);

    // 1. Total expenses by status
    const expensesByStatus = await Expense.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(userId),
          date: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', 'approved'] },
                '$approvedAmount',
                { $ifNull: ['$amount', 0] }
              ]
            }
          }
        }
      }
    ]);

    // 2. Breakdown by category
    const categoryBreakdown = await Expense.aggregate([
      {
        $match: {
          userId: mongoose.Types.ObjectId(userId),
          status: 'approved',
          date: { $gte: monthStart, $lte: monthEnd }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$approvedAmount' }
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ]);

    // 3. Calculate approval rate
    const totalExpenses = expensesByStatus.reduce((sum, item) => sum + item.count, 0);
    const approvedExpenses = expensesByStatus.find(item => item._id === 'approved')?.count || 0;
    const approvalRate = totalExpenses > 0 ? ((approvedExpenses / totalExpenses) * 100).toFixed(2) : 0;

    // 4. Total amounts
    const totalApprovedAmount = expensesByStatus.find(item => item._id === 'approved')?.totalAmount || 0;
    const totalPendingAmount = expensesByStatus.find(item => item._id === 'pending')?.totalAmount || 0;

    // Format for charts
    const categoryChartData = {
      labels: categoryBreakdown.map(item => item._id),
      datasets: [
        {
          label: 'Expenses by Category',
          data: categoryBreakdown.map(item => item.totalAmount)
        }
      ]
    };

    res.status(200).json({
      success: true,
      message: 'Monthly summary retrieved successfully',
      data: {
        user: {
          id: user._id,
          name: user.name,
          employeeId: user.employeeId
        },
        period: {
          year: yearNum,
          month: monthNum,
          monthName: monthStart.toLocaleString('default', { month: 'long' })
        },
        summary: {
          totalExpenses,
          approvedExpenses,
          pendingExpenses: expensesByStatus.find(item => item._id === 'pending')?.count || 0,
          rejectedExpenses: expensesByStatus.find(item => item._id === 'rejected')?.count || 0,
          totalApprovedAmount,
          totalPendingAmount,
          approvalRate: parseFloat(approvalRate)
        },
        categoryBreakdown,
        categoryChartData,
        expensesByStatus
      }
    });

  } catch (error) {
    console.error('Error in getMonthSummary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve monthly summary',
      error: error.message
    });
  }
};

module.exports = {
  getAdminDashboard,
  getUserDashboard,
  getMonthSummary
};

