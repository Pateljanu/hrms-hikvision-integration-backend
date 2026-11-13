const pool = require("../config/db");
const { getCompanySettingByDate } = require("./companySettingsModel");
const { getHolidayByDate } = require("./holidayModel");

const recalculateAttendanceByDateRange = async (start_date, end_date) => {
  // Fetch all attendance rows within date range
  const { rows } = await pool.query(
    `SELECT *
       FROM attendance
      WHERE attendance_date::DATE BETWEEN $1::DATE AND $2::DATE`,
    [start_date, end_date]
  );

  console.log("📌 Found attendance rows:", rows.length);

  let count = 0;

  for (const record of rows) {
    const dateObj = new Date(record.attendance_date);
    const date = dateObj.toISOString().split("T")[0]; // YYYY-MM-DD
    const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });

    // ---------------------------
    // Get company setting
    // ---------------------------
    const setting = await getCompanySettingByDate(date);
    if (!setting) continue;

    // ---------------------------
    // Get holiday
    // ---------------------------
    const holiday = await getHolidayByDate(date);

    // ---------------------------
    // Weekend list — fully fixed
    // ---------------------------
    let weekendList = [];

    if (Array.isArray(setting.weekend_days)) {
      weekendList = setting.weekend_days.map((d) => d.trim());
    } else if (typeof setting.weekend_days === "string") {
      const cleaned = setting.weekend_days.replace(/[{}"]/g, "");
      weekendList = cleaned.split(",").map((d) => d.trim());
    }

    const isWeekend = weekendList.includes(dayName);

    // ---------------------------
    // Worked hours calculation
    // ---------------------------
    let worked = false;
    let totalHours = 0;

    if (record.clock_in && record.clock_out) {
      const checkIn = new Date(`1970-01-01T${record.clock_in}`);
      const checkOut = new Date(`1970-01-01T${record.clock_out}`);

      if (!isNaN(checkIn) && !isNaN(checkOut)) {
        worked = true;
        totalHours = (checkOut - checkIn) / (1000 * 60 * 60);
      }
    }

    // ---------------------------
    // Required hours from interval → convert to numeric
    // ---------------------------
    let requiredHours = 0;

    if (setting.required_hours) {
      const interval = setting.required_hours;

      // Interval format from PG: { hours: 9, minutes: 0 }
      const h = interval.hours ?? 0;
      const m = interval.minutes ?? 0;

      requiredHours = h + m / 60;
    }

    // ---------------------------
    // Decide STATUS
    // ---------------------------
    let status = "Absent";

    // 1️⃣ Holiday
    if (holiday) {
      status = worked ? "Worked on Holiday" : "Holiday";
    }
    // 2️⃣ Weekend
    else if (isWeekend) {
      status = worked ? "Worked on Weekend" : "Weekend";
    }
    // 3️⃣ Normal day
    else {
      if (worked) {
        if (totalHours >= requiredHours) status = "Present-Full";
        else status = "Short-Hours";
      } else {
        status = "Absent";
      }
    }

    // ---------------------------
    // Convert worked hours to HH:MM:SS
    // ---------------------------
    const totalMinutes = Math.floor(totalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const interval = `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:00`;

    // ---------------------------
    // Update attendance row
    // ---------------------------
    await pool.query(
      `UPDATE attendance
         SET status = $1,
             worked_hours = $2::interval,
             company_setting_id = $3,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [status, interval, setting.id, record.id]
    );

    count++;
  }

  console.log(`✅ Recalculated ${count} attendance records between ${start_date} and ${end_date}`);

  return count;
};

module.exports = { recalculateAttendanceByDateRange };
