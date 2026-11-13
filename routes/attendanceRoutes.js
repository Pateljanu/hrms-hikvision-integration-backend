const express = require('express');
const router = express.Router();
const {
  listAttendance,
  listMyAttendance,
  attendanceSummary,
} = require('../controllers/attendanceController');

const { recalculateAttendanceByDateRange } = require("../models/attendanceRecalcModel");

const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');

// Admin: fetch all employees' attendance
router.post('/', verifyAdmin, listAttendance);

// Employee: fetch their own attendance
router.post('/my', verifyToken, listMyAttendance);

// Admin: daily summary
router.get('/summary', verifyAdmin, attendanceSummary);

// 🔥 ADMIN: manual recalc API
router.post('/recalculate', verifyAdmin, async (req, res) => {
  const { from, to } = req.body;

  const start = from || "1990-01-01";
  const end = to || "2100-01-01";

  const updatedCount = await recalculateAttendanceByDateRange(start, end);
  res.json({ message: "Attendance recalculated", updated: updatedCount });
});

module.exports = router;
