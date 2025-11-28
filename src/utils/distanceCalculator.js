/**
 * Distance Calculator Utility
 * Calculates distance between GPS coordinates using Google Maps API with Haversine fallback
 */

const axios = require('axios');

/**
 * Calculate distance using Google Maps Distance Matrix API
 * @param {Object} origin - Origin coordinates {latitude, longitude}
 * @param {Object} destination - Destination coordinates {latitude, longitude}
 * @returns {Promise<Object>} Distance data {distance: number (km), duration: number (minutes), source: 'google'}
 */
const calculateDistanceWithGoogleMaps = async (origin, destination) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  const originStr = `${origin.latitude},${origin.longitude}`;
  const destinationStr = `${destination.latitude},${destination.longitude}`;

  const url = 'https://maps.googleapis.com/maps/api/distancematrix/json';

  try {
    const response = await axios.get(url, {
      params: {
        origins: originStr,
        destinations: destinationStr,
        key: apiKey,
        mode: 'driving',
        units: 'metric'
      },
      timeout: 10000 // 10 second timeout
    });

    // Check API response status
    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
    }

    // Check if we have valid results
    const element = response.data.rows[0]?.elements[0];

    if (!element || element.status !== 'OK') {
      throw new Error(`No route found: ${element?.status || 'Unknown error'}`);
    }

    // Extract distance and duration
    const distanceMeters = element.distance.value; // in meters
    const durationSeconds = element.duration.value; // in seconds

    return {
      distance: parseFloat((distanceMeters / 1000).toFixed(2)), // Convert to km
      duration: Math.round(durationSeconds / 60), // Convert to minutes
      source: 'google',
      rawData: {
        distanceText: element.distance.text,
        durationText: element.duration.text
      }
    };
  } catch (error) {
    // If it's an axios error, provide more details
    if (error.response) {
      throw new Error(`Google Maps API request failed: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      throw new Error('Google Maps API request timeout or network error');
    } else {
      throw error;
    }
  }
};

/**
 * Calculate distance using Haversine formula (fallback method)
 * @param {Object} origin - Origin coordinates {latitude, longitude}
 * @param {Object} destination - Destination coordinates {latitude, longitude}
 * @returns {Object} Distance data {distance: number (km), source: 'haversine'}
 */
const calculateDistanceWithHaversine = (origin, destination) => {
  const R = 6371; // Earth's radius in kilometers

  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLon = toRadians(destination.longitude - origin.longitude);

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Distance in kilometers

  return {
    distance: parseFloat(distance.toFixed(2)),
    duration: null, // Haversine doesn't calculate duration
    source: 'haversine'
  };
};

/**
 * Convert degrees to radians
 * @param {number} degrees - Angle in degrees
 * @returns {number} Angle in radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Calculate distance between two GPS coordinates
 * Tries Google Maps API first, falls back to Haversine formula on failure
 * @param {Object} origin - Origin coordinates {latitude, longitude}
 * @param {Object} destination - Destination coordinates {latitude, longitude}
 * @param {Object} options - Options {forceHaversine: boolean, retries: number}
 * @returns {Promise<Object>} Distance data {distance: number (km), duration: number|null, source: string, error?: string}
 */
const calculateDistance = async (origin, destination, options = {}) => {
  const { forceHaversine = false, retries = 2 } = options;

  // Validate coordinates
  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) {
    throw new Error('Invalid GPS coordinates provided');
  }

  // If forced to use Haversine or no API key, use Haversine
  if (forceHaversine || !process.env.GOOGLE_MAPS_API_KEY) {
    return calculateDistanceWithHaversine(origin, destination);
  }

  // Try Google Maps API with retries
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await calculateDistanceWithGoogleMaps(origin, destination);
      return result;
    } catch (error) {
      lastError = error;

      // If it's a rate limit error, wait before retry
      if (error.message.includes('OVER_QUERY_LIMIT') && attempt < retries) {
        await sleep(1000 * (attempt + 1)); // Exponential backoff
        continue;
      }

      // For other errors, break and use fallback
      break;
    }
  }

  // Fallback to Haversine
  console.warn(`Google Maps API failed: ${lastError.message}. Using Haversine formula.`);

  const haversineResult = calculateDistanceWithHaversine(origin, destination);
  haversineResult.error = `Google Maps API unavailable: ${lastError.message}`;

  return haversineResult;
};

/**
 * Validate GPS coordinates
 * @param {Object} coords - Coordinates {latitude, longitude}
 * @returns {boolean} True if valid
 */
const isValidCoordinate = (coords) => {
  if (!coords || typeof coords !== 'object') {
    return false;
  }

  const { latitude, longitude } = coords;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return false;
  }

  if (latitude < -90 || latitude > 90) {
    return false;
  }

  if (longitude < -180 || longitude > 180) {
    return false;
  }

  return true;
};

/**
 * Sleep utility for retry delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Calculate journey cost based on distance and rate
 * @param {number} distance - Distance in kilometers
 * @param {number} rate - Rate per kilometer (required - fetch from Settings.getRatePerKm())
 * @returns {number} Cost in rupees
 */
const calculateJourneyCost = (distance, rate) => {
  if (!rate || typeof rate !== 'number' || rate <= 0) {
    throw new Error('Valid rate per kilometer is required for journey cost calculation');
  }

  return parseFloat((distance * rate).toFixed(2));
};

/**
 * Validate if two coordinates are significantly different
 * (to prevent starting/ending journey at same location)
 * @param {Object} coord1 - First coordinate {latitude, longitude}
 * @param {Object} coord2 - Second coordinate {latitude, longitude}
 * @param {number} minDistanceKm - Minimum distance in km (default: 0.1 km = 100 meters)
 * @returns {boolean} True if coordinates are different enough
 */
const areCoordinatesDifferent = (coord1, coord2, minDistanceKm = 0.1) => {
  const result = calculateDistanceWithHaversine(coord1, coord2);
  return result.distance >= minDistanceKm;
};

module.exports = {
  calculateDistance,
  calculateDistanceWithGoogleMaps,
  calculateDistanceWithHaversine,
  calculateJourneyCost,
  isValidCoordinate,
  areCoordinatesDifferent
};

