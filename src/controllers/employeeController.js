/**
 * Employee Controller
 * Handles CRUD operations for employee management (Admin only)
 */

const User = require('../models/User');
const Audit = require('../models/Audit');
const crypto = require('crypto');

/**
 * Generate a unique employee ID
 * Format: EMP + random 6-digit number
 * @returns {Promise<string>} Unique employee ID
 */
const generateEmployeeId = async () => {
  let employeeId;
  let exists = true;

  while (exists) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    employeeId = `EMP${randomNum}`;

    // Check if this ID already exists
    const existingUser = await User.findOne({ employeeId });
    exists = !!existingUser;
  }

  return employeeId;
};

/**
 * Generate a random password
 * Format: 8 characters with uppercase, lowercase, and numbers
 * @returns {string} Random password
 */
const generatePassword = () => {
  const length = 10;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';

  // Ensure at least one of each required character type
  password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // Uppercase
  password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // Lowercase
  password += '0123456789'[Math.floor(Math.random() * 10)]; // Number

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Create a new employee
 * POST /api/employees
 * @access Admin and Super Admin only
 * @description
 * - Super Admin can create any role (superadmin, admin, user)
 * - Admin can only create users (field agents)
 * - Newly created users are automatically assigned to the creating admin
 */
const createEmployee = async (req, res) => {
  try {
    const { email, password, name, employeeId, role, bankDetails, upiId, isActive, assignedTo } = req.body;

    // RBAC: Role-based creation restrictions
    const requestedRole = role || 'user';
    console.log('Creating employee - User role:', req.user.role, 'Requested role:', requestedRole);

    // Only superadmin can create superadmin or admin roles
    if ((requestedRole === 'superadmin' || requestedRole === 'admin') && req.user.role !== 'superadmin') {
      console.log('Access denied - User is not superadmin');
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can create admin or superadmin accounts'
      });
    }

    // Check if email already exists
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Check if employeeId already exists (if provided)
    if (employeeId) {
      const existingEmployeeId = await User.findOne({ employeeId: employeeId.toUpperCase() });
      if (existingEmployeeId) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID already exists'
        });
      }
    }

    // Generate employee ID if not provided
    const finalEmployeeId = employeeId ? employeeId.toUpperCase() : await generateEmployeeId();

    // Generate password if not provided
    const generatedPassword = password || generatePassword();
    const passwordToReturn = password ? null : generatedPassword; // Only return if auto-generated

    // RBAC: Determine assignedTo field
    let finalAssignedTo = null;

    if (requestedRole === 'user') {
      // For users (field agents):
      // - If admin is creating, auto-assign to themselves
      // - If superadmin is creating, use provided assignedTo or leave null
      if (req.user.role === 'admin') {
        finalAssignedTo = req.user.id; // Auto-assign to creating admin
      } else if (req.user.role === 'superadmin' && assignedTo) {
        // Verify the assignedTo user is an admin
        const assignedAdmin = await User.findById(assignedTo);
        if (!assignedAdmin || (assignedAdmin.role !== 'admin' && assignedAdmin.role !== 'superadmin')) {
          return res.status(400).json({
            success: false,
            message: 'assignedTo must be a valid admin or superadmin ID'
          });
        }
        finalAssignedTo = assignedTo;
      }
    }
    // For admin and superadmin roles, assignedTo is always null

    // Create employee
    const employee = new User({
      email: email.toLowerCase(),
      password: generatedPassword,
      name,
      employeeId: finalEmployeeId,
      role: requestedRole,
      assignedTo: finalAssignedTo,
      bankDetails,
      upiId,
      isActive: isActive !== undefined ? isActive : true
    });

    await employee.save();

    // Create audit log
    await Audit.log({
      action: 'employee_created',
      performedBy: req.user.id,
      targetUser: employee._id,
      metadata: {
        employeeId: finalEmployeeId,
        email: employee.email,
        role: employee.role
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Return employee without password
    const employeeData = employee.toSafeObject();

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: {
        employee: employeeData,
        ...(passwordToReturn && { generatedPassword: passwordToReturn }) // Include only if auto-generated
      }
    });

  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all employees with pagination and search
 * GET /api/employees?page=1&limit=10&search=john&role=user&isActive=true
 * @access Admin and Super Admin only
 * @description
 * - Super Admin can see all employees
 * - Admin can only see users assigned to them
 */
const getAllEmployees = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', role, isActive } = req.query;

    // Build query
    const query = {};

    // RBAC: Filter by assignedTo for admins
    if (req.user.role === 'admin') {
      // Admin can only see users assigned to them
      query.assignedTo = req.user.id;
    }
    // Super Admin sees all employees (no filter)

    // Search by name or email
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by role
    if (role) {
      query.role = role;
    }

    // Filter by active status
    if (isActive !== undefined) {
      query.isActive = isActive === 'true' || isActive === true;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Execute query with pagination
    const employees = await User.find(query)
      .select('-password') // Exclude password
      .populate('assignedTo', 'name email employeeId') // Populate assigned admin info
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        employees,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get employee by ID
 * GET /api/employees/:id
 * @access Admin and Super Admin only
 * @description
 * - Super Admin can see any employee
 * - Admin can only see users assigned to them
 */
const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await User.findById(id)
      .select('-password')
      .populate('assignedTo', 'name email employeeId');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // RBAC: Check access permissions
    if (req.user.role === 'admin') {
      // Admin can only access users assigned to them
      if (!employee.assignedTo || employee.assignedTo._id.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view users assigned to you.'
        });
      }
    }
    // Super Admin can access any employee

    res.json({
      success: true,
      data: { employee }
    });

  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update employee
 * PUT /api/employees/:id
 * @access Admin and Super Admin only
 * @description
 * - Super Admin can update any employee
 * - Admin can only update users assigned to them
 * - Only Super Admin can change role or assignedTo fields
 */
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow password updates through this endpoint
    if (updates.password) {
      return res.status(400).json({
        success: false,
        message: 'Use the password update endpoint to change password'
      });
    }

    // RBAC: Only superadmin can update role or assignedTo
    if ((updates.role || updates.assignedTo) && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only Super Admin can change role or assignment'
      });
    }

    // Check if employee exists
    const employee = await User.findById(id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // RBAC: Check access permissions
    if (req.user.role === 'admin') {
      // Admin can only update users assigned to them
      if (!employee.assignedTo || employee.assignedTo.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only update users assigned to you.'
        });
      }
    }
    // Super Admin can update any employee

    // Check email uniqueness if email is being updated
    if (updates.email && updates.email.toLowerCase() !== employee.email) {
      const existingEmail = await User.findOne({ email: updates.email.toLowerCase() });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Check employeeId uniqueness if employeeId is being updated
    if (updates.employeeId && updates.employeeId.toUpperCase() !== employee.employeeId) {
      const existingEmployeeId = await User.findOne({ employeeId: updates.employeeId.toUpperCase() });
      if (existingEmployeeId) {
        return res.status(400).json({
          success: false,
          message: 'Employee ID already exists'
        });
      }
    }

    // Validate assignedTo if being updated
    if (updates.assignedTo) {
      const assignedAdmin = await User.findById(updates.assignedTo);
      if (!assignedAdmin || (assignedAdmin.role !== 'admin' && assignedAdmin.role !== 'superadmin')) {
        return res.status(400).json({
          success: false,
          message: 'assignedTo must be a valid admin or superadmin ID'
        });
      }
    }

    // Update employee
    Object.keys(updates).forEach(key => {
      if (key === 'email') {
        employee[key] = updates[key].toLowerCase();
      } else if (key === 'employeeId') {
        employee[key] = updates[key].toUpperCase();
      } else {
        employee[key] = updates[key];
      }
    });

    await employee.save();

    // Create audit log
    await Audit.log({
      action: 'employee_updated',
      performedBy: req.user.id,
      targetUser: employee._id,
      metadata: {
        updatedFields: Object.keys(updates),
        employeeId: employee.employeeId
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: { employee: employee.toSafeObject() }
    });

  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete employee (soft delete)
 * DELETE /api/employees/:id
 * @access Admin and Super Admin only
 * @description
 * - Super Admin can delete any employee
 * - Admin can only delete users assigned to them
 */
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await User.findById(id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Prevent deleting yourself
    if (employee._id.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    // RBAC: Check access permissions
    if (req.user.role === 'admin') {
      // Admin can only delete users assigned to them
      if (!employee.assignedTo || employee.assignedTo.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only delete users assigned to you.'
        });
      }
    }
    // Super Admin can delete any employee

    // Soft delete - set isActive to false
    employee.isActive = false;
    await employee.save();

    // Create audit log
    await Audit.log({
      action: 'employee_deleted',
      performedBy: req.user.id,
      targetUser: employee._id,
      metadata: {
        employeeId: employee.employeeId,
        email: employee.email
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'high'
    });

    res.json({
      success: true,
      message: 'Employee deleted successfully'
    });

  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Reset employee password (generate new password)
 * POST /api/employees/:id/reset-password
 * @access Admin and Super Admin only
 * @description
 * - Generates a new random password for the employee
 * - Returns the new password to the admin
 * - Super Admin can reset any employee's password
 * - Admin can only reset passwords for users assigned to them
 */
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;

    const employee = await User.findById(id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // RBAC: Check access permissions
    if (req.user.role === 'admin') {
      // Admin can only reset passwords for users assigned to them
      if (!employee.assignedTo || employee.assignedTo.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only reset passwords for users assigned to you.'
        });
      }
    }
    // Super Admin can reset any employee's password

    // Generate new password
    const newPassword = generatePassword();

    // Update password (will be hashed by pre-save hook)
    employee.password = newPassword;
    await employee.save();

    // Create audit log
    await Audit.log({
      action: 'password_reset',
      performedBy: req.user.id,
      targetUser: employee._id,
      metadata: {
        employeeId: employee.employeeId,
        resetBy: 'admin'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'high'
    });

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        newPassword: newPassword,
        employeeId: employee.employeeId,
        employeeName: employee.name
      }
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update employee password
 * PUT /api/employees/:id/password
 * @access Admin and Super Admin only
 * @description
 * - Super Admin can update any employee's password
 * - Admin can only update passwords for users assigned to them
 */
const updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const employee = await User.findById(id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // RBAC: Check access permissions
    if (req.user.role === 'admin') {
      // Admin can only update passwords for users assigned to them
      if (!employee.assignedTo || employee.assignedTo.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only update passwords for users assigned to you.'
        });
      }
    }
    // Super Admin can update any employee's password

    // Update password (will be hashed by pre-save hook)
    employee.password = newPassword;
    await employee.save();

    // Create audit log
    await Audit.log({
      action: 'password_updated',
      performedBy: req.user.id,
      targetUser: employee._id,
      metadata: {
        employeeId: employee.employeeId,
        updatedBy: 'admin'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      severity: 'medium'
    });

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  updatePassword,
  resetPassword
};

