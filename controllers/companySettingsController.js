const {
  upsertCompanySetting,
  getAllCompanySettings,
  getCompanySettingByDate
} = require('../models/companySettingsModel');

const { recalculateAttendanceByDateRange } = require("../models/attendanceRecalcModel");

const setCompanySetting = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      work_start,
      work_end,
      required_hours,
      weekend_days,
      is_default
    } = req.body;

    const updated_by = req.user.employee_code;

    if (!work_start || !work_end || !required_hours)
      return res.status(400).json({ message: 'work_start, work_end, and required_hours are required' });

    // Save company setting (default or non-default)
    const result = await upsertCompanySetting({
      start_date,
      end_date,
      work_start,
      work_end,
      required_hours,
      weekend_days,
      is_default: is_default || false,
      updated_by
    });

    // 🔥🔥 IMPORTANT FIX — RECALCULATE ATTENDANCE
    await recalculateAttendanceByDateRange("1990-01-01", "2100-01-01");

    res.status(201).json({
      message: 'Company setting saved + attendance recalculated',
      data: result
    });

  } catch (err) {
    console.error("🔥 Company Setting Error:", err);
    res.status(500).json({ error: err.message });
  }
};

const listCompanySettings = async (req, res) => {
  try {
    const data = await getAllCompanySettings();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getSettingByDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date query parameter required' });

    const data = await getCompanySettingByDate(date);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  setCompanySetting,
  listCompanySettings,
  getSettingByDate
};
