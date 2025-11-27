/**
 * Report Controller
 * Handles expense report generation in Excel and CSV formats
 */

const Expense = require('../models/Expense');
const Journey = require('../models/Journey');
const User = require('../models/User');
const Audit = require('../models/Audit');
const Settings = require('../models/Settings');
const ExcelJS = require('exceljs');
const { format } = require('fast-csv');
const { Readable } = require('stream');
const PDFDocument = require('pdfkit');

/**
 * Generate Expense Report
 * GET /api/reports/expense-report
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const generateExpenseReport = async (req, res) => {
  try {
    const { startDate, endDate, employeeId, format: reportFormat, status } = req.query;
    const currentUser = req.user;

    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    if (!reportFormat || !['csv', 'excel', 'pdf'].includes(reportFormat.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Format must be either "csv", "excel", or "pdf"'
      });
    }

    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before or equal to end date'
      });
    }

    // Build query filters
    const query = {
      date: {
        $gte: start,
        $lte: end
      }
    };

    // Apply status filter
    if (status && status !== 'all') {
      query.status = status;
    }

    // Apply employee filter with RBAC
    if (employeeId) {
      query.userId = employeeId;
    } else if (currentUser.role === 'admin') {
      // Admin can only see their assigned users
      const assignedUsers = await User.find({ assignedTo: currentUser.userId }).select('_id');
      const assignedUserIds = assignedUsers.map(u => u._id);
      query.userId = { $in: assignedUserIds };
    }
    // Super admin can see all employees (no additional filter)

    // Fetch expenses with populated fields
    const expenses = await Expense.find(query)
      .populate('userId', 'name employeeId')
      .populate('journeyId')
      .populate('approvedBy', 'name')
      .sort({ date: 1, userId: 1 })
      .lean();

    if (expenses.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No expenses found for the selected criteria'
      });
    }

    // Get rate per km from settings
    const ratePerKm = await Settings.getRatePerKm();

    // Transform data for report
    const reportData = await transformExpenseData(expenses, ratePerKm);

    // Generate report based on format
    if (reportFormat.toLowerCase() === 'excel') {
      await generateExcelReport(res, reportData, start, end, employeeId, ratePerKm);
    } else if (reportFormat.toLowerCase() === 'pdf') {
      await generatePDFReport(res, reportData, start, end, employeeId, ratePerKm);
    } else {
      await generateCSVReport(res, reportData, start, end, ratePerKm);
    }

    // Audit log
    try {
      await Audit.create({
        performedBy: currentUser.userId,
        action: 'report_generated',
        details: {
          startDate,
          endDate,
          employeeId: employeeId || 'all',
          format: reportFormat,
          status: status || 'all',
          recordCount: expenses.length
        }
      });
    } catch (auditError) {
      console.error('Failed to create audit log for report generation:', auditError);
      // Don't throw - audit logging should not break report generation
    }

  } catch (error) {
    console.error('Error generating expense report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
};

/**
 * Transform expense data to new 12-column report format
 * Groups expenses by journey and categorizes by type
 * @param {Array} expenses - Array of expense documents
 * @param {Number} ratePerKm - Rate per kilometer from settings
 * @returns {Array} Transformed data for report
 */
const transformExpenseData = async (expenses, ratePerKm) => {
  // Group expenses by journey
  const journeyGroups = {};

  expenses.forEach(expense => {
    const journeyId = expense.journeyId?._id?.toString() || 'no-journey';
    if (!journeyGroups[journeyId]) {
      journeyGroups[journeyId] = {
        journey: expense.journeyId,
        expenses: []
      };
    }
    journeyGroups[journeyId].expenses.push(expense);
  });

  const reportRows = [];

  // Process each journey group
  for (const journeyId in journeyGroups) {
    const group = journeyGroups[journeyId];
    const journey = group.journey;
    const journeyExpenses = group.expenses;

    // Initialize expense category totals
    let travellingAmount = 0; // Tickets + Car Rental + Toll
    let siteExpenses = 0; // Courier + Local Purchase + Transport Charges + Office Expense
    let lodgingRoom = 0; // Lodging
    let otherExpense = 0; // Food + Others
    let totalKm = journey?.calculatedDistance || 0;
    let petrolExpense = totalKm * ratePerKm;
    let machineVisitCost = journey?.machineVisitCost || 0;

    // Categorize and sum expenses
    journeyExpenses.forEach(expense => {
      const amount = expense.approvedAmount || expense.amount || 0;
      const type = expense.type;

      // For journey-attached expenses (except main journey expense), add to travelling amount
      if (expense.journeyId && type !== 'journey') {
        travellingAmount += amount;
      }
      // Travelling Amount = Tickets + Car Rental + Toll
      else if (['tickets', 'car_rental', 'toll'].includes(type)) {
        travellingAmount += amount;
      }
      // Site Expenses = Courier + Local Purchase + Transport Charges + Office Expense
      else if (['courier', 'local_purchase', 'transport_charges', 'office_expense'].includes(type)) {
        siteExpenses += amount;
      }
      // Lodging ROOM
      else if (type === 'lodging') {
        lodgingRoom += amount;
      }
      // Other Expense = Food + Others + Fuel (if not journey-based)
      else if (['food', 'others', 'fuel', 'other', 'accessories'].includes(type)) {
        otherExpense += amount;
      }
    });

    // Calculate total
    const totalAmount = travellingAmount + siteExpenses + lodgingRoom + petrolExpense + otherExpense + machineVisitCost;

    // Create row for this journey
    reportRows.push({
      date: journey ? formatDate(journey.startTimestamp) : formatDate(journeyExpenses[0]?.date),
      customerName: journey?.customerName || journey?.name || 'General Expense',
      natureOfWork: journey?.natureOfWork || 'N/A',
      siteLocation: journey?.endAddress || journey?.siteLocation || 'N/A',
      typeOfVisit: journey?.typeOfVisit ? journey.typeOfVisit.replace('_', ' ') : 'N/A',
      travellingAmount: travellingAmount,
      siteExpenses: siteExpenses,
      lodgingRoom: lodgingRoom,
      totalKm: totalKm,
      petrolExpense: petrolExpense,
      machineVisitCost: machineVisitCost,
      otherExpense: otherExpense,
      totalAmount: totalAmount,
      employeeName: journeyExpenses[0]?.userId?.name || 'Unknown',
      employeeId: journeyExpenses[0]?.userId?.employeeId || 'N/A',
      remarks: journeyExpenses.map(exp => exp.notes || '').filter(note => note).join('; ') || 'N/A',
      journeyId: journeyId
    });
  }

  return reportRows;
};

/**
 * Format date to DD/MM/YYYY HH:MM
 * @param {Date} date - Date object
 * @returns {String} Formatted date string
 */
const formatDate = (date) => {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'N/A';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Format expense type to readable string
 * @param {String} type - Expense type
 * @returns {String} Formatted type
 */
const formatExpenseType = (type) => {
  const typeMap = {
    'journey': 'Journey',
    'food': 'Food',
    'accessories': 'Accessories',
    'other': 'Other'
  };
  return typeMap[type] || type;
};

/**
 * Generate Excel report with new 12-column format
 * @param {Object} res - Express response object
 * @param {Array} data - Report data
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {String} employeeId - Employee ID (optional)
 * @param {Number} ratePerKm - Rate per kilometer
 */
const generateExcelReport = async (res, data, startDate, endDate, employeeId, ratePerKm) => {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Expense Details (Main Sheet)
  const detailsSheet = workbook.addWorksheet('Expense Report');

  // Add title and date range
  const titleRow = detailsSheet.addRow(['EXPENSE REPORT']);
  titleRow.font = { bold: true, size: 16 };
  titleRow.alignment = { horizontal: 'center' };
  detailsSheet.mergeCells('A1:L1');

  const dateRow = detailsSheet.addRow([`Period: ${formatDate(startDate)} to ${formatDate(endDate)}`]);
  dateRow.font = { bold: true, size: 12 };
  dateRow.alignment = { horizontal: 'center' };
  detailsSheet.mergeCells('A2:L2');

  if (employeeId) {
    const employeeName = data[0]?.employeeName || 'Unknown';
    const empRow = detailsSheet.addRow([`Employee: ${employeeName} (${data[0]?.employeeId || 'N/A'})`]);
    empRow.font = { bold: true, size: 11 };
    empRow.alignment = { horizontal: 'center' };
    detailsSheet.mergeCells('A3:L3');
  }

  detailsSheet.addRow([]); // Empty row

  // Add headers (12 columns)
  const headers = [
    'Date and Time',
    'Name of the Customer',
    'Nature of Work',
    'Site Location',
    'Type of Visit',
    'Travelling Amount (Rs.)',
    'Site Expenses',
    'Lodging ROOM',
    'Travel Expense',
    'Other Expense',
    'Total Expenses Cost (Rs.)',
    'Remarks'
  ];

  const headerRow = detailsSheet.addRow(headers);

  // Style header row
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4299E1' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 30;

  // Add borders to header row
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Calculate totals
  let grandTotalTravelling = 0;
  let grandTotalSiteExpenses = 0;
  let grandTotalLodging = 0;
  let grandTotalKm = 0;
  let grandTotalPetrol = 0;
  let grandTotalMachineVisit = 0;
  let grandTotalOther = 0;
  let grandTotal = 0;

  // Add data rows
  data.forEach(row => {
    const travelExpense = `${row.totalKm.toFixed(2)} KM (₹${row.petrolExpense.toFixed(2)})`;
    const dataRow = detailsSheet.addRow([
      row.date,
      row.customerName,
      row.natureOfWork,
      row.siteLocation,
      row.typeOfVisit,
      row.travellingAmount,
      row.siteExpenses,
      row.lodgingRoom,
      travelExpense,
      row.otherExpense,
      row.totalAmount,
      row.remarks
    ]);

    // Add borders
    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Accumulate totals
    grandTotalTravelling += row.travellingAmount;
    grandTotalSiteExpenses += row.siteExpenses;
    grandTotalLodging += row.lodgingRoom;
    grandTotalKm += row.totalKm;
    grandTotalPetrol += row.petrolExpense;
    grandTotalMachineVisit += row.machineVisitCost;
    grandTotalOther += row.otherExpense;
    grandTotal += row.totalAmount;
  });

  // Add empty row before totals
  detailsSheet.addRow([]);

  // Add grand total row
  const grandTotalRow = detailsSheet.addRow([
    '',
    '',
    '',
    'GRAND TOTAL',
    grandTotalTravelling,
    grandTotalSiteExpenses,
    grandTotalLodging,
    grandTotalKm,
    grandTotalPetrol,
    grandTotalMachineVisit,
    grandTotalOther,
    grandTotal
  ]);

  grandTotalRow.font = { bold: true, size: 12 };
  grandTotalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD1FAE5' }
  };

  // Add borders to grand total row
  grandTotalRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'medium' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' }
    };
  });

  // Format currency columns (E to L)
  for (let col = 5; col <= 12; col++) {
    detailsSheet.getColumn(col).numFmt = '₹#,##0.00';
  }

  // Set column widths
  detailsSheet.getColumn(1).width = 12; // Date
  detailsSheet.getColumn(2).width = 20; // Customer Name
  detailsSheet.getColumn(3).width = 25; // Nature of Work
  detailsSheet.getColumn(4).width = 25; // Site Location
  detailsSheet.getColumn(5).width = 15; // Travelling Amount
  detailsSheet.getColumn(6).width = 15; // Site Expenses
  detailsSheet.getColumn(7).width = 15; // Lodging ROOM
  detailsSheet.getColumn(8).width = 12; // Total KM
  detailsSheet.getColumn(9).width = 15; // Petrol Expense
  detailsSheet.getColumn(10).width = 18; // Machine Visit Cost
  detailsSheet.getColumn(11).width = 15; // Other Expense
  detailsSheet.getColumn(12).width = 15; // Total Amount

  // Freeze header rows (title + headers)
  const headerRowNumber = employeeId ? 5 : 4;
  detailsSheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];

  // Add footer notes
  detailsSheet.addRow([]);
  const noteRow1 = detailsSheet.addRow(['Notes:']);
  noteRow1.font = { bold: true };

  detailsSheet.addRow([`• Rate per KM: ₹${ratePerKm}`]);
  detailsSheet.addRow(['• Travelling Amount = Tickets + Car Rental + Toll']);
  detailsSheet.addRow(['• Site Expenses = Courier + Local Purchase + Transport Charges + Office Expense']);
  detailsSheet.addRow(['• Other Expense = Food + Others + Fuel']);
  detailsSheet.addRow(['• Petrol Expense = Total KM × Rate per KM']);

  // Set response headers
  const filename = `expense-report-${Date.now()}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Write to buffer first, then send
  const buffer = await workbook.xlsx.writeBuffer();
  res.send(buffer);
};

/**
 * Generate CSV report with new 12-column format
 * @param {Object} res - Express response object
 * @param {Array} data - Report data
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {Number} ratePerKm - Rate per kilometer
 */
const generateCSVReport = async (res, data, startDate, endDate, ratePerKm) => {
  const csvData = data.map(row => ({
    'Date and Time': row.date,
    'Name of the Customer': row.customerName,
    'Nature of Work': row.natureOfWork,
    'Site Location': row.siteLocation,
    'Type of Visit': row.typeOfVisit,
    'Travelling Amount (Rs.)': row.travellingAmount.toFixed(2),
    'Site Expenses': row.siteExpenses.toFixed(2),
    'Lodging ROOM': row.lodgingRoom.toFixed(2),
    'Travel Expense': `${row.totalKm.toFixed(2)} KM (₹${row.petrolExpense.toFixed(2)})`,
    'Other Expense': row.otherExpense.toFixed(2),
    'Total Expenses Cost (Rs.)': row.totalAmount.toFixed(2),
    'Remarks': row.remarks
  }));

  const filename = `expense-report-${Date.now()}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const csvStream = format({ headers: true });
  csvStream.pipe(res);

  csvData.forEach(row => {
    csvStream.write(row);
  });

  csvStream.end();
};

/**
 * Generate PDF report with new 12-column format
 * @param {Object} res - Express response object
 * @param {Array} data - Report data
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {String} employeeId - Employee ID (optional)
 * @param {Number} ratePerKm - Rate per kilometer
 */
const generatePDFReport = async (res, data, startDate, endDate, employeeId, ratePerKm) => {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 30
  });

  // Set response headers
  const filename = `expense-report-${Date.now()}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Pipe PDF to response
  doc.pipe(res);

  // Title
  doc.fontSize(20).font('Helvetica-Bold').text('EXPENSE REPORT', { align: 'center' });
  doc.moveDown(0.5);

  // Date range
  doc.fontSize(12).font('Helvetica').text(
    `Period: ${formatDate(startDate)} to ${formatDate(endDate)}`,
    { align: 'center' }
  );
  doc.moveDown(0.5);

  // Employee info if specified
  if (employeeId) {
    const employeeName = data[0]?.employeeName || 'Unknown';
    const empId = data[0]?.employeeId || 'N/A';
    doc.fontSize(10).text(`Employee: ${employeeName} (${empId})`, { align: 'center' });
    doc.moveDown(0.5);
  }

  // Define table columns
  const tableTop = doc.y + 10;
  const colWidths = [60, 70, 70, 70, 60, 60, 60, 80, 60, 60, 60, 60]; // Column widths
  const rowHeight = 20;
  let currentY = tableTop;

  // Headers
  const headers = [
    'Date and\nTime',
    'Name of the\nCustomer',
    'Nature of\nWork',
    'Site\nLocation',
    'Type of\nVisit',
    'Travelling\nAmount (Rs.)',
    'Site\nExpenses',
    'Lodging\nROOM',
    'Travel\nExpense',
    'Other\nExpense',
    'Total Expenses\nCost (Rs.)',
    'Remarks'
  ];

  // Draw header row
  doc.fontSize(8).font('Helvetica-Bold');
  let currentX = 30;

  headers.forEach((header, index) => {
    // Draw cell background
    doc.rect(currentX, currentY, colWidths[index], rowHeight).fill('#4299E1');
    doc.fillColor('white').text(header, currentX + 2, currentY + 4, {
      width: colWidths[index] - 4,
      height: rowHeight - 8,
      align: 'center'
    });
    currentX += colWidths[index];
  });

  currentY += rowHeight;

  // Calculate totals
  let grandTotalTravelling = 0;
  let grandTotalSiteExpenses = 0;
  let grandTotalLodging = 0;
  let grandTotalKm = 0;
  let grandTotalPetrol = 0;
  let grandTotalMachineVisit = 0;
  let grandTotalOther = 0;
  let grandTotal = 0;

  // Draw data rows
  doc.fontSize(6).font('Helvetica');
  data.forEach((row, rowIndex) => {
    currentX = 30;

    // Alternate row colors
    const fillColor = rowIndex % 2 === 0 ? '#f8f9fa' : 'white';
    doc.rect(30, currentY, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(fillColor);

    const travelExpense = `${row.totalKm.toFixed(2)} KM\n(₹${row.petrolExpense.toFixed(2)})`;
    const cellData = [
      row.date,
      row.customerName,
      row.natureOfWork,
      row.siteLocation,
      row.typeOfVisit,
      `₹${row.travellingAmount.toFixed(2)}`,
      `₹${row.siteExpenses.toFixed(2)}`,
      `₹${row.lodgingRoom.toFixed(2)}`,
      travelExpense,
      `₹${row.otherExpense.toFixed(2)}`,
      `₹${row.totalAmount.toFixed(2)}`,
      row.remarks
    ];

    cellData.forEach((cell, index) => {
      doc.fillColor('black').text(cell, currentX + 2, currentY + 4, {
        width: colWidths[index] - 4,
        height: rowHeight - 8,
        align: 'center'
      });
      currentX += colWidths[index];
    });

    currentY += rowHeight;

    // Accumulate totals
    grandTotalTravelling += row.travellingAmount;
    grandTotalSiteExpenses += row.siteExpenses;
    grandTotalLodging += row.lodgingRoom;
    grandTotalKm += row.totalKm;
    grandTotalPetrol += row.petrolExpense;
    grandTotalMachineVisit += row.machineVisitCost;
    grandTotalOther += row.otherExpense;
    grandTotal += row.totalAmount;

    // Add new page if needed
    if (currentY > 500) {
      doc.addPage();
      currentY = 50;
    }
  });

  // Draw total row
  currentX = 30;
  const totalData = [
    '',
    '',
    '',
    'GRAND TOTAL',
    `₹${grandTotalTravelling.toFixed(2)}`,
    `₹${grandTotalSiteExpenses.toFixed(2)}`,
    `₹${grandTotalLodging.toFixed(2)}`,
    grandTotalKm.toFixed(2),
    `₹${grandTotalPetrol.toFixed(2)}`,
    `₹${grandTotalMachineVisit.toFixed(2)}`,
    `₹${grandTotalOther.toFixed(2)}`,
    `₹${grandTotal.toFixed(2)}`
  ];

  // Total row background
  doc.rect(30, currentY, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#D1FAE5');
  doc.fontSize(8).font('Helvetica-Bold');

  totalData.forEach((cell, index) => {
    doc.fillColor('black').text(cell, currentX + 2, currentY + 4, {
      width: colWidths[index] - 4,
      height: rowHeight - 8,
      align: 'center'
    });
    currentX += colWidths[index];
  });

  currentY += rowHeight + 10;

  // Add notes
  doc.fontSize(8).font('Helvetica');
  doc.text('Notes:', 30, currentY);
  currentY += 15;

  doc.text(`• Rate per KM: ₹${ratePerKm}`, 40, currentY);
  currentY += 12;
  doc.text('• Travelling Amount = Tickets + Car Rental + Toll', 40, currentY);
  currentY += 12;
  doc.text('• Site Expenses = Courier + Local Purchase + Transport Charges + Office Expense', 40, currentY);
  currentY += 12;
  doc.text('• Other Expense = Food + Others + Fuel', 40, currentY);
  currentY += 12;
  doc.text('• Petrol Expense = Total KM × Rate per KM', 40, currentY);

  // Finalize PDF
  doc.end();
};

module.exports = {
  generateExpenseReport
};

