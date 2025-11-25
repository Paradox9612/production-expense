/**
 * Google Maps API Configuration
 * Used for distance calculation between GPS coordinates
 */

module.exports = {
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  distanceMatrixUrl: 'https://maps.googleapis.com/maps/api/distancematrix/json',
  geocodingUrl: 'https://maps.googleapis.com/maps/api/geocode/json',
  
  // Default settings
  mode: 'driving',
  units: 'metric',
  
  // Rate limiting
  maxRetries: 3,
  retryDelay: 1000, // ms
  
  // Validation
  validateApiKey() {
    if (!this.apiKey) {
      throw new Error('Google Maps API key is not configured');
    }
    return true;
  }
};

