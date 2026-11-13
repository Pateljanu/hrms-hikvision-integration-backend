const {
  getAllAttendance,
  getAttendanceByEmployee,
  getDailySummary,
} = require('../models/attendanceModel');

// Admin: list all attendance
const listAttendance = async (req, res) => {
  try {
      
    const { from, to } = req.query;
    const start = from || '1900-01-01';
    const end = to || '3000-01-01';
    const data = await getAllAttendance(start, end);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: error.message });
  }
};

// Employee: list own attendance
const listMyAttendance = async (req, res) => {
  try {
    const { from, to } = req.query;
    const start = from || '1900-01-01';
    const end = to || '3000-01-01';

    // Make sure middleware set req.user
    if (!req.user || !req.user.employee_code) {
      return res.status(401).json({ message: 'Unauthorized (no employee_code in token)' });
    }
    const empCode = req.user.employee_code;

    // IMPORTANT: await here
    const data = await getAttendanceByEmployee(empCode, start, end);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching employee attendance:', error);
    res.status(500).json({ error: error.message });
  }
};

// Admin: daily summary
const attendanceSummary = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: 'Please provide date in YYYY-MM-DD format' });
    }
    const summary = await getDailySummary(date);
    res.status(200).json(summary);
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  listAttendance,
  listMyAttendance,
  attendanceSummary,
};