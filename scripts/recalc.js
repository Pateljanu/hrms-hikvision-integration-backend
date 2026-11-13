const { recalculateAttendanceByDateRange } = require("../models/attendanceRecalcModel");

(async () => {
  await recalculateAttendanceByDateRange("2025-10-01", "2025-10-30");
  console.log("DONE");
  process.exit();
})();
