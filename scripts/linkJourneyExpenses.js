/**
 * Script to link existing completed journeys with their corresponding expenses
 * This fixes journeys that were completed before the expenseId linking was implemented
 */

const mongoose = require('mongoose');
const Journey = require('../src/models/Journey');
const Expense = require('../src/models/Expense');

async function linkJourneyExpenses() {
  try {
    console.log('Starting journey-expense linking process...');

    // Find all completed journeys that don't have expenseId set
    const journeysWithoutExpenseId = await Journey.find({
      status: 'completed',
      expenseId: { $exists: false }
    });

    console.log(`Found ${journeysWithoutExpenseId.length} journeys without expenseId`);

    let linkedCount = 0;
    let skippedCount = 0;

    for (const journey of journeysWithoutExpenseId) {
      // Find the corresponding expense
      const expense = await Expense.findOne({
        journeyId: journey._id,
        type: 'journey'
      });

      if (expense) {
        // Link the expense to the journey
        journey.expenseId = expense._id;
        await journey.save();
        linkedCount++;
        console.log(`Linked journey ${journey._id} with expense ${expense._id}`);
      } else {
        console.log(`No expense found for journey ${journey._id}`);
        skippedCount++;
      }
    }

    console.log(`Process completed:`);
    console.log(`- ${linkedCount} journeys linked with expenses`);
    console.log(`- ${skippedCount} journeys skipped (no matching expense)`);

  } catch (error) {
    console.error('Error linking journey expenses:', error);
  }
}

// Run if called directly
if (require.main === module) {
  require('dotenv').config();
  const connectDB = require('../src/config/database');

  connectDB()
    .then(() => {
      console.log('Connected to database');
      return linkJourneyExpenses();
    })
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { linkJourneyExpenses };