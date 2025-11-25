/**
 * Models Index
 * Central export point for all Mongoose models
 */

const User = require('./User');
const Expense = require('./Expense');
const Journey = require('./Journey');
const Advance = require('./Advance');
const Audit = require('./Audit');
const MonthLock = require('./MonthLock');
const Settings = require('./Settings');

module.exports = {
  User,
  Expense,
  Journey,
  Advance,
  Audit,
  MonthLock,
  Settings
};

