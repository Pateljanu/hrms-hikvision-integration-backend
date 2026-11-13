const { addHoliday, getHolidays, deleteHoliday } = require("../models/holidayModel");

const createHoliday = async (req, res) => {
  try {
    const { holiday_date, title, description } = req.body;
    const created_by = req.user.employee_code;

    if (!holiday_date || !title) {
      return res.status(400).json({ message: "holiday_date and title are required" });
    }

    const data = await addHoliday({ holiday_date, title, description, created_by });

    res.status(201).json({ message: "Holiday saved", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listHolidays = async (req, res) => {
  try {
    const data = await getHolidays();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const removeHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    await deleteHoliday(id);
    res.status(200).json({ message: "Holiday deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { createHoliday, listHolidays, removeHoliday };
