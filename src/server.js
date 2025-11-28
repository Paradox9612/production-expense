/**
 * FieldX Backend Server
 * Main entry point for the Express API server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Parse CORS origins from environment variable
// Supports comma-separated origins and mobile apps
const getCorsOrigins = () => {
  const origins = process.env.CORS_ORIGIN;
  if (!origins) return '*'; // Allow all if not configured

  // Split comma-separated origins into array
  const originList = origins.split(',').map(origin => origin.trim());

  // Return function for dynamic origin checking (supports mobile apps)
  return (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (originList.includes(origin) || originList.includes('*')) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  };
};

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: getCorsOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Request-Id']
}));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(rateLimiter); // Rate limiting

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'FieldX API Server is running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      employees: '/api/employees',
      journeys: '/api/journeys',
      expenses: '/api/expenses',
      advances: '/api/advances',
      uploads: '/api/uploads',
      dashboard: '/api/dashboard',
      reports: '/api/reports',
      settings: '/api/settings'
    },
    docs: 'See README.md for API documentation'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/journeys', require('./routes/journeys'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/advances', require('./routes/advances'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to all interfaces for mobile access
app.listen(PORT, HOST, () => {
  console.log(`🚀 FieldX Server running on ${HOST}:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://${HOST}:${PORT}/health`);
  console.log(`📱 Mobile access: http://192.168.1.32:${PORT}/health`);
});

module.exports = app;

