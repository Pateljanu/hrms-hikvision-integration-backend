const pool = require('../config/db');

// Admin: get all attendance with date range
const getAllAttendance = async (from, to) => {
  const sql = `
    SELECT id, employee_code, full_name, attendance_date,
           clock_in, clock_out, worked_hours, status, company_setting_id
    FROM attendance
    WHERE attendance_date::date BETWEEN $1::date AND $2::date
    ORDER BY attendance_date::date DESC, employee_code;
  `;
  const { rows } = await pool.query(sql, [from, to]);
  return rows;
};



// Employee: get attendance for a single employee with date range
const getAttendanceByEmployee = async (employee_code, from, to) => {
  const sql = `
    SELECT attendance_date, clock_in, clock_out, worked_hours, status
    FROM attendance
    WHERE employee_code = $1
      AND attendance_date BETWEEN $2::date AND $3::date
    ORDER BY attendance_date DESC;
  `;
  const { rows } = await pool.query(sql, [employee_code, from, to]);
  return rows;
};

// Admin: daily status summary
const getDailySummary = async (date) => {
  const sql = `
    SELECT status, COUNT(*) AS count
    FROM attendance
    WHERE attendance_date = $1::date
    GROUP BY status
    ORDER BY status;
  `;
  const { rows } = await pool.query(sql, [date]);
  return rows;
};

module.exports = {
  getAllAttendance,
  getAttendanceByEmployee,
  getDailySummary,
};

