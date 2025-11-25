# FieldX Backend API Server

A Node.js/Express backend API for the FieldX expense tracking system.

## Features

- User authentication and authorization
- Journey tracking with GPS coordinates
- Expense management with approval workflow
- File upload support (Cloudinary)
- Distance calculation (Google Maps API with Haversine fallback)
- Bulk expense approval with variance filtering
- Audit logging
- Rate limiting and security

## Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Google Maps API key (optional)
- Cloudinary account (optional)

## Installation

1. Clone the repository
2. Navigate to the server directory:
   ```bash
   cd packages/server
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

5. Configure your environment variables in `.env`

## Environment Variables

See `.env.example` for all required environment variables. Key variables:

- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: JWT signing secret (min 32 characters)
- `GOOGLE_MAPS_API_KEY`: For accurate distance calculations
- `CLOUDINARY_*`: For file uploads

## Development

```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Run tests
npm test

# Seed database
npm run seed
```

## Deployment to Render

### 1. Prepare Your Repository

1. Ensure `.gitignore` excludes sensitive files (already configured)
2. Copy `.env.example` to `.env` and fill in production values
3. Test locally with production environment

### 2. Create Render Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:

   **Basic Settings:**
   - **Name**: `fieldx-server` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 3. Environment Variables

Add these environment variables in Render:

```
NODE_ENV=production
PORT=10000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_strong_jwt_secret_here
JWT_REFRESH_SECRET=your_strong_refresh_secret_here
JWT_EXPIRE=1d
JWT_REFRESH_EXPIRE=7d
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/jpg,application/pdf
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
DEFAULT_DISTANCE_RATE=8
CORS_ORIGIN=https://your-frontend-domain.com
```

### 4. Database Setup

1. Create a MongoDB Atlas cluster
2. Whitelist Render's IP addresses (0.0.0.0/0 for development)
3. Create a database user with read/write permissions
4. Use the connection string in `MONGODB_URI`

### 5. Deploy

1. Click "Create Web Service"
2. Wait for deployment to complete
3. Your API will be available at `https://your-service-name.onrender.com`

## API Documentation

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout

### Journeys
- `GET /api/journeys` - Get all journeys
- `POST /api/journeys/start` - Start a journey
- `PUT /api/journeys/:id/end` - End a journey
- `GET /api/journeys/active` - Get active journey

### Expenses
- `GET /api/expenses` - Get all expenses
- `POST /api/expenses` - Create expense
- `POST /api/expenses/bulk-approve` - Bulk approve expenses
- `POST /api/expenses/:id/approve` - Approve single expense
- `POST /api/expenses/:id/reject` - Reject expense

### Other Endpoints
- `GET /api/employees` - Employee management
- `GET /api/dashboard/admin` - Admin dashboard
- `POST /api/uploads/image` - File upload

## Project Structure

```
src/
├── controllers/     # Route handlers
├── models/         # MongoDB schemas
├── routes/         # API routes
├── middleware/     # Express middleware
├── utils/          # Utility functions
├── config/         # Configuration files
└── server.js       # Main server file
```

## Security Features

- JWT authentication
- Rate limiting
- CORS protection
- Input validation
- File upload restrictions
- Audit logging

## License

MIT