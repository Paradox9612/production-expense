/**
 * Variance Calculator Utility
 * Calculates variance between system and manual distances for journey expenses
 */

/**
 * Calculate variance percentage between system and manual distances
 * Formula: |manual - system| / system × 100
 * 
 * @param {number} systemDistance - System-calculated distance in km
 * @param {number} manualDistance - User-entered manual distance in km
 * @returns {number} Variance percentage (0-100+)
 * 
 * @example
 * calculateVariance(10, 12) // Returns 20 (20% variance)
 * calculateVariance(100, 95) // Returns 5 (5% variance)
 */
const calculateVariance = (systemDistance, manualDistance) => {
  // Validate inputs
  if (typeof systemDistance !== 'number' || typeof manualDistance !== 'number') {
    throw new Error('Both systemDistance and manualDistance must be numbers');
  }

  if (systemDistance < 0 || manualDistance < 0) {
    throw new Error('Distances cannot be negative');
  }

  // If system distance is 0, cannot calculate variance
  if (systemDistance === 0) {
    return 0;
  }

  // Calculate absolute difference
  const difference = Math.abs(manualDistance - systemDistance);

  // Calculate percentage variance
  const variance = (difference / systemDistance) * 100;

  // Round to 2 decimal places
  return parseFloat(variance.toFixed(2));
};

/**
 * Get variance category based on percentage
 * 
 * @param {number} variancePercentage - Variance percentage
 * @returns {string} Category: 'low', 'medium', or 'high'
 * 
 * @example
 * getVarianceCategory(5) // Returns 'low'
 * getVarianceCategory(15) // Returns 'medium'
 * getVarianceCategory(25) // Returns 'high'
 */
const getVarianceCategory = (variancePercentage) => {
  if (typeof variancePercentage !== 'number') {
    throw new Error('Variance percentage must be a number');
  }

  if (variancePercentage < 0) {
    throw new Error('Variance percentage cannot be negative');
  }

  if (variancePercentage <= 10) {
    return 'low';
  }

  if (variancePercentage <= 20) {
    return 'medium';
  }

  return 'high';
};

/**
 * Calculate variance with category
 * 
 * @param {number} systemDistance - System-calculated distance in km
 * @param {number} manualDistance - User-entered manual distance in km
 * @returns {Object} Object with variance and category
 * 
 * @example
 * calculateVarianceWithCategory(10, 12)
 * // Returns { variance: 20, category: 'high' }
 */
const calculateVarianceWithCategory = (systemDistance, manualDistance) => {
  const variance = calculateVariance(systemDistance, manualDistance);
  const category = getVarianceCategory(variance);

  return {
    variance,
    category
  };
};

/**
 * Check if variance is within acceptable range
 * 
 * @param {number} variancePercentage - Variance percentage
 * @param {number} maxAcceptable - Maximum acceptable variance (default: 10%)
 * @returns {boolean} True if variance is acceptable
 * 
 * @example
 * isVarianceAcceptable(5) // Returns true
 * isVarianceAcceptable(15) // Returns false
 * isVarianceAcceptable(15, 20) // Returns true
 */
const isVarianceAcceptable = (variancePercentage, maxAcceptable = 10) => {
  if (typeof variancePercentage !== 'number' || typeof maxAcceptable !== 'number') {
    throw new Error('Both parameters must be numbers');
  }

  return variancePercentage <= maxAcceptable;
};

/**
 * Calculate final amount based on approved option
 *
 * @param {Object} expense - Expense object
 * @param {number} approvedOption - Approved option (1=system, 2=manual, 3=admin)
 * @param {number} adminDistance - Admin override distance (required if option 3)
 * @returns {number} Final approved amount
 *
 * @example
 * calculateApprovedAmount({ systemDistance: 10, distanceRate: 8, amount: 200 }, 1)
 * // Returns 280 (200 expense + 80 distance cost)
 */
const calculateApprovedAmount = (expense, approvedOption, adminDistance = null) => {
  if (!expense) {
    throw new Error('Expense object is required');
  }

  if (![1, 2, 3].includes(approvedOption)) {
    throw new Error('Approved option must be 1, 2, or 3');
  }

  const rate = expense.distanceRate || 8;
  let distanceCost = 0;

  // Calculate distance-based cost
  if (approvedOption === 1) {
    distanceCost = (expense.systemDistance || 0) * rate;
  } else if (approvedOption === 2) {
    distanceCost = (expense.manualDistance || 0) * rate;
  } else if (approvedOption === 3) {
    if (adminDistance === null || adminDistance === undefined) {
      throw new Error('Admin distance is required for option 3');
    }
    distanceCost = adminDistance * rate;
  }

  // For journey expenses, add the expense amount to the distance cost
  // For non-journey expenses, just use the expense amount
  const baseAmount = expense.type === 'journey' ? expense.amount || 0 : expense.amount || 0;
  const totalAmount = baseAmount + distanceCost;

  return parseFloat(totalAmount.toFixed(2));
};

module.exports = {
  calculateVariance,
  getVarianceCategory,
  calculateVarianceWithCategory,
  isVarianceAcceptable,
  calculateApprovedAmount
};

