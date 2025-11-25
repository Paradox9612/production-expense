/**
 * Validation Utilities
 * Joi schemas for request validation across the application
 */

const Joi = require('joi');

/**
 * MongoDB ObjectId validation schema
 */
const objectIdSchema = Joi.string()
  .pattern(/^[0-9a-fA-F]{24}$/)
  .messages({
    'string.pattern.base': 'Invalid ObjectId format'
  });

/**
 * Password validation schema
 * Requires: min 8 chars, at least 1 uppercase, 1 lowercase, 1 number
 */
const passwordSchema = Joi.string()
  .min(8)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  .required()
  .messages({
    'string.min': 'Password must be at least 8 characters long',
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    'any.required': 'Password is required'
  });

/**
 * Email validation schema
 */
const emailSchema = Joi.string()
  .email()
  .lowercase()
  .trim()
  .required()
  .messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required'
  });

/**
 * Employee ID validation schema
 * Format: Alphanumeric, 3-20 characters, uppercase
 */
const employeeIdSchema = Joi.string()
  .alphanum()
  .min(3)
  .max(20)
  .uppercase()
  .trim()
  .messages({
    'string.alphanum': 'Employee ID must contain only letters and numbers',
    'string.min': 'Employee ID must be at least 3 characters',
    'string.max': 'Employee ID must not exceed 20 characters'
  });

/**
 * IFSC Code validation schema
 * Format: 11 characters, alphanumeric
 */
const ifscCodeSchema = Joi.string()
  .length(11)
  .pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/)
  .uppercase()
  .trim()
  .messages({
    'string.length': 'IFSC code must be exactly 11 characters',
    'string.pattern.base': 'Invalid IFSC code format'
  });

/**
 * UPI ID validation schema
 * Format: username@provider
 */
const upiIdSchema = Joi.string()
  .pattern(/^[\w.-]+@[\w.-]+$/)
  .lowercase()
  .trim()
  .messages({
    'string.pattern.base': 'Invalid UPI ID format (e.g., username@upi)'
  });

/**
 * Bank account number validation schema
 * Format: 9-18 digits
 */
const accountNumberSchema = Joi.string()
  .pattern(/^\d{9,18}$/)
  .trim()
  .messages({
    'string.pattern.base': 'Account number must be 9-18 digits'
  });

/**
 * Employee creation validation schema
 */
const createEmployeeSchema = Joi.object({
  email: emailSchema,
  password: Joi.alternatives().try(
    Joi.string().valid(''), // Allow empty string
    passwordSchema // Or valid password
  ).optional(), // Optional - will auto-generate if not provided or empty
  name: Joi.string().min(2).max(100).trim().required().messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name must not exceed 100 characters',
    'any.required': 'Name is required'
  }),
  employeeId: employeeIdSchema.optional(), // Optional - will auto-generate if not provided
  role: Joi.string().valid('superadmin', 'admin', 'user').default('user').messages({
    'any.only': 'Role must be one of: superadmin, admin, user'
  }),
  bankDetails: Joi.object({
    accountNumber: accountNumberSchema.optional().allow(''),
    ifscCode: ifscCodeSchema.optional().allow(''),
    bankName: Joi.string().max(100).trim().optional().allow(''),
    accountHolderName: Joi.string().max(100).trim().optional().allow('')
  }).optional(),
  upiId: upiIdSchema.optional().allow(''),
  isActive: Joi.boolean().default(true)
});

/**
 * Employee update validation schema
 * Similar to create but all fields optional except those being updated
 */
const updateEmployeeSchema = Joi.object({
  email: emailSchema.optional(),
  name: Joi.string().min(2).max(100).trim().optional(),
  employeeId: employeeIdSchema.optional(),
  role: Joi.string().valid('admin', 'user').optional(),
  bankDetails: Joi.object({
    accountNumber: accountNumberSchema.optional().allow(''),
    ifscCode: ifscCodeSchema.optional().allow(''),
    bankName: Joi.string().max(100).trim().optional().allow(''),
    accountHolderName: Joi.string().max(100).trim().optional().allow('')
  }).optional(),
  upiId: upiIdSchema.optional().allow(''),
  isActive: Joi.boolean().optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

/**
 * Password update validation schema
 */
const updatePasswordSchema = Joi.object({
  newPassword: passwordSchema,
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
    'any.only': 'Passwords do not match',
    'any.required': 'Password confirmation is required'
  })
});

/**
 * Pagination and search validation schema
 */
const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().optional().allow(''),
  role: Joi.string().valid('admin', 'user').optional(),
  isActive: Joi.boolean().optional()
});

// ========================================
// JOURNEY VALIDATION SCHEMAS
// ========================================

/**
 * GPS Coordinates Schema
 * Validates latitude and longitude
 */
const coordinatesSchema = Joi.object({
  latitude: Joi.number()
    .min(-90)
    .max(90)
    .required()
    .messages({
      'number.base': 'Latitude must be a number',
      'number.min': 'Latitude must be between -90 and 90',
      'number.max': 'Latitude must be between -90 and 90',
      'any.required': 'Latitude is required'
    }),
  longitude: Joi.number()
    .min(-180)
    .max(180)
    .required()
    .messages({
      'number.base': 'Longitude must be a number',
      'number.min': 'Longitude must be between -180 and 180',
      'number.max': 'Longitude must be between -180 and 180',
      'any.required': 'Longitude is required'
    })
});

/**
 * Start Journey Schema
 * For starting a new journey
 */
const startJourneySchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Journey name is required',
      'string.min': 'Journey name cannot be empty',
      'string.max': 'Journey name cannot exceed 100 characters',
      'any.required': 'Journey name is required'
    }),
  startCoordinates: coordinatesSchema.required(),
  startAddress: Joi.string().trim().max(500).optional().allow(''),
  gpsOffline: Joi.boolean().default(false),
  gpsOfflineReason: Joi.string()
    .valid('permission_denied', 'location_disabled', 'timeout', 'other')
    .optional()
    .when('gpsOffline', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.forbidden()
    }),
  deviceInfo: Joi.object({
    platform: Joi.string().max(50).optional(),
    osVersion: Joi.string().max(50).optional(),
    appVersion: Joi.string().max(50).optional()
  }).optional(),
  notes: Joi.string().trim().max(500).optional().allow('')
});

/**
 * End Journey Schema
 * For ending an active journey
 */
const endJourneySchema = Joi.object({
  endCoordinates: coordinatesSchema.required(),
  endAddress: Joi.string().trim().max(500).optional().allow(''),
  notes: Joi.string().trim().max(500).optional().allow(''),
  manualDistance: Joi.number().min(0).max(10000).optional() // Optional manual distance override
});

/**
 * Journey Pagination Schema
 * For listing journeys with filters
 */
const journeyPaginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid('active', 'completed', 'cancelled').optional(),
  userId: Joi.string().optional(), // For admin to filter by user
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional().when('startDate', {
    is: Joi.exist(),
    then: Joi.date().min(Joi.ref('startDate'))
  })
});

// ========================================
// EXPENSE VALIDATION SCHEMAS
// ========================================

/**
 * Create Expense Schema
 * For creating new expenses (journey or non-journey)
 */
const createExpenseSchema = Joi.object({
  type: Joi.string()
    .valid('journey', 'food', 'lodging', 'fuel', 'tickets', 'car_rental', 'courier', 'toll', 'local_purchase', 'transport_charges', 'office_expense', 'others', 'accessories', 'other')
    .required()
    .messages({
      'any.required': 'Expense type is required',
      'any.only': 'Type must be one of: journey, food, lodging, fuel, tickets, car_rental, courier, toll, local_purchase, transport_charges, office_expense, others, accessories, other'
    }),
  expenseCategory: Joi.string()
    .valid('general', 'journey')
    .required()
    .messages({
      'any.required': 'Expense category is required',
      'any.only': 'Expense category must be either general or journey'
    }),
  date: Joi.date().iso().optional(),
  description: Joi.string().trim().max(500).required(),
  amount: Joi.number().min(0).required(),

  // Journey-specific fields
  journeyId: Joi.string().when('expenseCategory', {
    is: 'journey',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  startCoordinates: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required()
  }).when('type', {
    is: 'journey',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  }),
  endCoordinates: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required()
  }).when('type', {
    is: 'journey',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  }),
  startAddress: Joi.string().trim().max(500).optional().allow(''),
  endAddress: Joi.string().trim().max(500).optional().allow(''),
  systemDistance: Joi.number().min(0).optional(),
  manualDistance: Joi.number().min(0).when('type', {
    is: 'journey',
    then: Joi.optional(),
    otherwise: Joi.forbidden()
  }),
  gpsOffline: Joi.boolean().optional(),
  distanceRate: Joi.number().min(0).optional(),

  // Attachments
  attachments: Joi.array().items(
    Joi.object({
      url: Joi.string().uri().required(),
      filename: Joi.string().optional(),
      fileType: Joi.string().optional(),
      fileSize: Joi.number().optional()
    })
  ).optional()
});

/**
 * Update Expense Schema
 * For updating existing expenses (before approval only)
 */
const updateExpenseSchema = Joi.object({
  type: Joi.string()
    .valid('journey', 'food', 'lodging', 'fuel', 'tickets', 'car_rental', 'courier', 'toll', 'local_purchase', 'transport_charges', 'office_expense', 'others', 'accessories', 'other')
    .optional()
    .messages({
      'any.only': 'Type must be one of: journey, food, lodging, fuel, tickets, car_rental, courier, toll, local_purchase, transport_charges, office_expense, others, accessories, other'
    }),
  date: Joi.date().iso().optional(),
  description: Joi.string().trim().max(500).optional(),
  amount: Joi.number().min(0).optional(),
  manualDistance: Joi.number().min(0).optional(),
  attachments: Joi.array().items(
    Joi.object({
      url: Joi.string().uri().required(),
      filename: Joi.string().optional(),
      fileType: Joi.string().optional(),
      fileSize: Joi.number().optional()
    })
  ).optional()
});

/**
 * Expense Filter Schema
 * For filtering expenses with advanced criteria
 */
const expenseFilterSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  userId: Joi.string().optional(),
  type: Joi.string().valid('journey', 'food', 'lodging', 'fuel', 'tickets', 'car_rental', 'courier', 'toll', 'local_purchase', 'transport_charges', 'office_expense', 'others', 'accessories', 'other').optional(),
  status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional().when('dateFrom', {
    is: Joi.exist(),
    then: Joi.date().min(Joi.ref('dateFrom'))
  }),
  varianceMin: Joi.number().min(0).optional(),
  varianceMax: Joi.number().min(0).optional().when('varianceMin', {
    is: Joi.exist(),
    then: Joi.number().min(Joi.ref('varianceMin'))
  }),
  sortBy: Joi.string().valid('date', 'amount', 'variance', 'createdAt', 'approvedAt').default('date'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

/**
 * Approval Schema
 * For approving expenses
 */
const approveExpenseSchema = Joi.object({
  approvedOption: Joi.number().valid(1, 2, 3).required().messages({
    'any.required': 'Approved option is required',
    'any.only': 'Approved option must be 1 (system), 2 (manual), or 3 (admin)'
  }),
  adminDistance: Joi.number().min(0).when('approvedOption', {
    is: 3,
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  adminNotes: Joi.string().trim().max(1000).optional().allow('')
});

/**
 * Rejection Schema
 * For rejecting expenses
 */
const rejectExpenseSchema = Joi.object({
  rejectionReason: Joi.string().trim().max(500).required().messages({
    'any.required': 'Rejection reason is required',
    'string.max': 'Rejection reason cannot exceed 500 characters'
  })
});

/**
 * Bulk Approve Schema
 * For bulk approving expenses
 */
const bulkApproveSchema = Joi.object({
  expenseIds: Joi.array().items(Joi.string()).min(1).required().messages({
    'any.required': 'Expense IDs array is required',
    'array.min': 'At least one expense ID is required'
  }),
  approvedOption: Joi.number().valid(1, 2, 3).default(1).optional(),
  maxVariance: Joi.number().min(0).optional(),
  adminNotes: Joi.string().trim().max(1000).optional().allow('')
});

/**
 * Validation middleware factory
 * Creates middleware that validates request data against a schema
 * @param {Joi.Schema} schema - Joi validation schema
 * @param {string} property - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware function
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Return all errors, not just the first one
      stripUnknown: true // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Replace request property with validated and sanitized value
    req[property] = value;
    next();
  };
};

/**
 * MongoDB ObjectId validation
 */
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * ObjectId validation middleware
 */
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`
      });
    }

    next();
  };
};

/**
 * ========================================
 * ADVANCE PAYMENT VALIDATION SCHEMAS
 * ========================================
 */

/**
 * Create advance payment schema
 * POST /api/advances
 */
const createAdvanceSchema = Joi.object({
  userId: objectIdSchema.required().messages({
    'any.required': 'User ID is required'
  }),
  amount: Joi.number()
    .positive()
    .precision(2)
    .required()
    .messages({
      'number.base': 'Amount must be a number',
      'number.positive': 'Amount must be greater than 0',
      'any.required': 'Amount is required'
    }),
  proofUrl: Joi.string()
    .uri()
    .trim()
    .allow('', null)
    .messages({
      'string.uri': 'Proof URL must be a valid URL'
    }),
  notes: Joi.string()
    .trim()
    .max(500)
    .allow('', null)
    .messages({
      'string.max': 'Notes cannot exceed 500 characters'
    }),
  description: Joi.string()
    .trim()
    .max(200)
    .allow('', null)
    .messages({
      'string.max': 'Description cannot exceed 200 characters'
    }),
  paymentMethod: Joi.string()
    .valid('cash', 'bank_transfer', 'upi', 'cheque', 'other')
    .default('bank_transfer')
    .messages({
      'any.only': 'Payment method must be one of: cash, bank_transfer, upi, cheque, other'
    }),
  transactionReference: Joi.string()
    .trim()
    .max(100)
    .allow('', null)
    .messages({
      'string.max': 'Transaction reference cannot exceed 100 characters'
    })
});

/**
 * Get advances with filters schema
 * GET /api/advances
 */
const getAdvancesSchema = Joi.object({
  userId: objectIdSchema.optional(),
  status: Joi.string()
    .valid('pending', 'completed', 'cancelled')
    .optional()
    .messages({
      'any.only': 'Status must be one of: pending, completed, cancelled'
    }),
  dateFrom: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.format': 'Date from must be a valid ISO date'
    }),
  dateTo: Joi.date()
    .iso()
    .min(Joi.ref('dateFrom'))
    .optional()
    .messages({
      'date.format': 'Date to must be a valid ISO date',
      'date.min': 'Date to must be after date from'
    }),
  paymentMethod: Joi.string()
    .valid('cash', 'bank_transfer', 'upi', 'cheque', 'other')
    .optional()
    .messages({
      'any.only': 'Payment method must be one of: cash, bank_transfer, upi, cheque, other'
    }),
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .optional()
    .messages({
      'number.base': 'Page must be a number',
      'number.integer': 'Page must be an integer',
      'number.min': 'Page must be at least 1'
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .optional()
    .messages({
      'number.base': 'Limit must be a number',
      'number.integer': 'Limit must be an integer',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100'
    }),
  sortBy: Joi.string()
    .valid('date', 'amount', 'createdAt')
    .default('date')
    .optional()
    .messages({
      'any.only': 'Sort by must be one of: date, amount, createdAt'
    }),
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .optional()
    .messages({
      'any.only': 'Sort order must be either asc or desc'
    })
});

/**
 * Advance ID parameter schema
 * GET /api/advances/:id or /api/advances/user/:userId
 */
const advanceIdSchema = Joi.object({
  id: objectIdSchema.optional(),
  userId: objectIdSchema.optional()
}).or('id', 'userId');

/**
 * ========================================
 * DASHBOARD VALIDATION SCHEMAS
 * ========================================
 */

/**
 * User ID parameter schema for dashboard
 * GET /api/dashboard/user/:id
 */
const dashboardUserIdSchema = Joi.object({
  id: objectIdSchema.required().messages({
    'any.required': 'User ID is required'
  })
});

/**
 * Monthly summary parameters schema
 * GET /api/dashboard/monthly/:userId/:year/:month
 */
const monthSummarySchema = Joi.object({
  userId: objectIdSchema.required().messages({
    'any.required': 'User ID is required'
  }),
  year: Joi.number()
    .integer()
    .min(2020)
    .max(2100)
    .required()
    .messages({
      'number.base': 'Year must be a number',
      'number.integer': 'Year must be an integer',
      'number.min': 'Year must be at least 2020',
      'number.max': 'Year cannot exceed 2100',
      'any.required': 'Year is required'
    }),
  month: Joi.number()
    .integer()
    .min(1)
    .max(12)
    .required()
    .messages({
      'number.base': 'Month must be a number',
      'number.integer': 'Month must be an integer',
      'number.min': 'Month must be at least 1',
      'number.max': 'Month cannot exceed 12',
      'any.required': 'Month is required'
    })
});

module.exports = {
  // Schemas
  objectIdSchema,
  passwordSchema,
  emailSchema,
  employeeIdSchema,
  ifscCodeSchema,
  upiIdSchema,
  accountNumberSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  updatePasswordSchema,
  paginationSchema,

  // Journey Schemas
  coordinatesSchema,
  startJourneySchema,
  endJourneySchema,
  journeyPaginationSchema,

  // Expense Schemas
  createExpenseSchema,
  updateExpenseSchema,
  expenseFilterSchema,
  approveExpenseSchema,
  rejectExpenseSchema,
  bulkApproveSchema,

  // Middleware
  validate,
  validateObjectId,
  isValidObjectId,

  // Advance schemas
  createAdvanceSchema,
  getAdvancesSchema,
  advanceIdSchema,

  // Dashboard schemas
  dashboardUserIdSchema,
  monthSummarySchema
};

