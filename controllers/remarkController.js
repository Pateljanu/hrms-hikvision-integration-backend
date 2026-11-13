const pool = require("../config/db");
const AttendanceRemarkModel = require("../models/attendanceRemarkModel");
const { recalculateAttendanceByDateRange } = require("../models/attendanceRecalcModel");

// ======================
// Employee submits remark
// ======================
exports.createEmployeeRemark = async (req, res) => {
  try {
    const { employee_code } = req.user;

    const {
      attendance_date,
      new_clock_in,
      new_clock_out,
      remark_text,
    } = req.body;

    if (!attendance_date || !remark_text) {
      return res.status(400).json({ message: "Missing fields" });
    }

    // Get original attendance entry
    const attendanceResult = await pool.query(
      `
        SELECT clock_in, clock_out
        FROM attendance
        WHERE employee_code = $1 AND attendance_date = $2
      `,
      [employee_code, attendance_date]
    );

    if (attendanceResult.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "Attendance row not found for this date" });
    }

    const { clock_in: old_clock_in, clock_out: old_clock_out } =
      attendanceResult.rows[0];

    // Save remark
    const remark = await AttendanceRemarkModel.createRemark({
      employee_code,
      attendance_date,
      old_clock_in,
      old_clock_out,
      new_clock_in,
      new_clock_out,
      remark_text,
    });

    res.json({ message: "Remark submitted", remark });
  } catch (err) {
    console.error("Error creating remark:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================
// Employee views own remarks
// ======================
exports.getMyRemarks = async (req, res) => {
  try {
    const { employee_code } = req.user;

    const remarks = await AttendanceRemarkModel.getMyRemarks(employee_code);

    res.json(remarks);
  } catch (err) {
    console.error("Error fetching remarks:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================
// Admin: get pending remarks
// ======================
exports.getAdminPendingRemarks = async (req, res) => {
  try {
    const remarks = await AttendanceRemarkModel.getPendingRemarks();
    res.json(remarks);
  } catch (err) {
    console.error("Error fetching pending remarks:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================
// Admin: accept remark
// ======================
exports.acceptRemark = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_response } = req.body;

    // Get remark from CORRECT TABLE: remarks
    const remarkResult = await pool.query(
      `
        SELECT *
        FROM remarks
        WHERE id = $1
      `,
      [id]
    );

    if (remarkResult.rowCount === 0) {
      return res.status(404).json({ message: "Remark not found" });
    }

    const remark = remarkResult.rows[0];

    // Update attendance
    await pool.query(
      `
        UPDATE attendance
        SET clock_in = COALESCE($1, clock_in),
            clock_out = COALESCE($2, clock_out)
        WHERE employee_code = $3
          AND attendance_date = $4
      `,
      [
        remark.new_clock_in,
        remark.new_clock_out,
        remark.employee_code,
        remark.attendance_date,
      ]
    );

    // 🔥 RECALCULATE WORKED HOURS + STATUS
    await recalculateAttendanceByDateRange(
      remark.attendance_date,
      remark.attendance_date
    );

    // Update remark status
    const updated = await AttendanceRemarkModel.updateStatus(
      id,
      "approved",
      admin_response
    );

    res.json({ message: "Remark approved", updated });
  } catch (err) {
    console.error("Error approving remark:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ======================
// Admin: reject remark
// ======================
exports.rejectRemark = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_response } = req.body;

    const updated = await AttendanceRemarkModel.updateStatus(
      id,
      "rejected",
      admin_response
    );

    res.json({ message: "Remark rejected", updated });
  } catch (err) {
    console.error("Error rejecting remark:", err);
    res.status(500).json({ message: "Server error" });
  }
};
