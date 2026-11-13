// controllers/leaveController.js
const pool = require('../config/db');
const {
  getAllocation,
  upsertAllocation,
  getRuleForMonth,
  getBalance,
  createBalanceForMonth,
  adjustBalancesForAllocation,
  updateBalanceUse,
  createLeaveRequest,
  getLeaveRequestById,
  updateLeaveRequestStatus,
  listLeaves,
  getLatestBalanceSummary,
  getBusinessDaysBetween,
  recomputeFutureBalances,
  applyExtraLeave,
  recalculateApprovedLeaves,
  getAllExtraLeave
} = require('../models/leaveModel');

/**
 * ensureBalanceForMonth: same as before
 */
const ensureBalanceForMonth = async (employee_code, year, month) => {
  const existing = await getBalance(employee_code, year, month);
  if (existing) return existing;

  const created = await createBalanceForMonth(employee_code, year, month);
  return created;
};

/**
 * setAllocation: upsert rule, adjust existing leave_balance rows, and create missing balances
 * NOTE: insertion section adjusted to compute remaining using monthly_assigned + carry_from_previous - used
 */
const setAllocation = async (req, res) => {
  const client = await pool.connect();
  try {
    const { year, month, paid } = req.body;

    if (!year || !month || paid === undefined) {
      return res.status(400).json({ error: "year, month and paid are required" });
    }

    const Y = Number(year);
    const M = Number(month);
    const P = Number(paid);

    // 1️⃣ Save or update allocation rule
    const allocation = await upsertAllocation(Y, M, P);

    // 2️⃣ Update this month's leave_balance rows
    const adjustResult = await adjustBalancesForAllocation(Y, M, P);

    // 3️⃣ Create this month's leave_balance row for employees who don't have it
    await client.query(
      `
      INSERT INTO leave_balance (
        employee_code,
        year,
        month,
        monthly_assigned,
        carry_from_previous,
        used,
        remaining,
        created_at,
        updated_at
      )
      SELECT 
        e.employee_code,
        $1 AS year,
        $2 AS month,
        $3 AS monthly_assigned,
        COALESCE(prev.remaining, 0) AS carry,
        0 AS used,
        (COALESCE(prev.remaining, 0) + $3 - 0) AS remaining,
        NOW(),
        NOW()
      FROM employees e
      LEFT JOIN leave_balance lb 
        ON lb.employee_code = e.employee_code
       AND lb.year = $1
       AND lb.month = $2
      LEFT JOIN leave_balance prev
        ON prev.employee_code = e.employee_code
       AND (prev.year, prev.month) = (
           SELECT year, month
           FROM leave_balance p2
           WHERE p2.employee_code = e.employee_code
           ORDER BY year DESC, month DESC
           LIMIT 1
       )
      WHERE lb.id IS NULL;
      `,
      [Y, M, P]
    );

    // 4️⃣ RECALCULATE PAID/UNPAID DAYS for all approved leaves
    const { rows: employees } = await client.query(`SELECT employee_code FROM employees`);

    for (const emp of employees) {
      await recalculateApprovedLeaves(emp.employee_code);
    }

    return res.status(200).json({
      message: "Allocation saved for specific month, balances updated, and leave days recalculated",
      allocation,
      adjustResult
    });

  } catch (err) {
    console.error("setAllocation error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  } finally {
    client.release();
  }
};


/**
 * applyLeave: unchanged
 */
const applyLeave = async (req, res) => {
  try {
    const employee_code = req.user?.employee_code;
    if (!employee_code) return res.status(401).json({ error: 'Unauthorized' });

    const { start_date, end_date, reason } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date required' });

    const created = await createLeaveRequest(employee_code, start_date, end_date, reason || null);
    return res.status(201).json({ message: 'Leave request created', data: created });
  } catch (err) {
    console.error('applyLeave error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

/**
 * changeLeaveStatus: unchanged core logic, but relies on updated updateBalanceUse
 */
const changeLeaveStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { id } = req.params;
    const { status } = req.body;
    const approved_by = req.user?.employee_code || req.user?.username || 'admin';

    if (!id) return res.status(400).json({ error: 'leave id required' });
    if (!status) return res.status(400).json({ error: 'status required' });

    const leave = await getLeaveRequestById(Number(id));
    if (!leave) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Leave request not found' });
    }

    // If already same status, return early
    if (leave.status === status) {
      await client.query('COMMIT');
      return res.status(200).json({ message: `Leave already ${status}`, data: leave });
    }

    if (status === 'Rejected') {
      const updated = await updateLeaveRequestStatus(Number(id), 'Rejected', approved_by, 0, 0);
      await client.query('COMMIT');
      return res.status(200).json({ message: 'Leave rejected', data: updated });
    }

    if (status === 'Approved') {
      // get business days list
      const businessDays = getBusinessDaysBetween(leave.start_date, leave.end_date);
      const totalDays = businessDays.length;

      // group by year-month
      const byMonth = {};
      for (const d of businessDays) {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const key = `${y}-${m}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      }

      let paidTotal = 0;
      let unpaidTotal = 0;

      // For each month group, ensure balance exists and consume
      for (const key of Object.keys(byMonth).sort()) {
        const [yStr, mStr] = key.split('-');
        const y = Number(yStr);
        const m = Number(mStr);
        const daysCount = Number(byMonth[key]);

        const balance = await ensureBalanceForMonth(leave.employee_code, y, m);

        const currentRemaining = Number(balance.remaining || 0);

        const paidToConsume = Math.max(0, Math.min(currentRemaining, daysCount));

        const unpaidForMonth = daysCount - paidToConsume;

        if (paidToConsume > 0) {
          await updateBalanceUse(balance.id, paidToConsume);
        }

        paidTotal += paidToConsume;
        unpaidTotal += unpaidForMonth;
      }

      // update leave request row
      const updated = await updateLeaveRequestStatus(Number(id), 'Approved', approved_by, paidTotal, unpaidTotal);
      await client.query('COMMIT');
      return res.status(200).json({ message: 'Leave approved', data: updated });
    }

    await client.query('ROLLBACK');
    return res.status(400).json({ error: 'Invalid status' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('changeLeaveStatus error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
};

/**
 * listAllLeaves: unchanged
 */
const listAllLeaves = async (req, res) => {
  try {
    const rows = await listLeaves();
    return res.status(200).json(rows);
  } catch (err) {
    console.error('listAllLeaves error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};

/**
 * myLeaves: ensure current month row exists; return summary computed (no total_available column)
 */
const myLeaves = async (req, res) => {
  try {
    const employee_code = req.user?.employee_code;
    if (!employee_code) return res.status(401).json({ error: 'Unauthorized' });

    // get current month
    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth() + 1;

    // ensure current month row exists
    let balance = await getBalance(employee_code, currYear, currMonth);
    if (!balance) {
      balance = await createBalanceForMonth(employee_code, currYear, currMonth);
    }

    // compute final values
    const total_available = Number(balance.monthly_assigned) + Number(balance.carry_from_previous);
    const used = Number(balance.used || 0);
    const remaining = Number(balance.remaining || 0);

    // fetch leave history
    const { rows: leaves } = await pool.query(
      `SELECT * FROM leave_requests WHERE employee_code = $1 ORDER BY id DESC`,
      [employee_code]
    );

    return res.status(200).json({
      leaves,
      balance_summary: {
        year: currYear,
        month: currMonth,
        total_available,
        used,
        remaining
      }
    });

  } catch (err) {
    console.error("myLeaves error:", err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};


/**
 * getAllEmployeeLeaveSummary:
 * Now compute total_available on-the-fly as monthly_assigned + carry_from_previous
 * Remaining for summary is computed as (total_available - paid_used) to avoid relying on stale stored remaining.
 */
const getAllEmployeeLeaveSummary = async (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const { rows } = await pool.query(`
      WITH used_days AS (
        SELECT
          employee_code,
          COALESCE(SUM(paid_days), 0) AS paid_used,
          COALESCE(SUM(unpaid_days), 0) AS unpaid_used
        FROM leave_requests
        WHERE status = 'Approved'
        AND EXTRACT(YEAR FROM start_date) = $1
        AND EXTRACT(MONTH FROM start_date) = $2
        GROUP BY employee_code
      )

      SELECT
        e.employee_code,
        e.full_name,
        lb.year,
        lb.month,
        lb.remaining,               -- ✔ USE ACTUAL DB VALUE
        lb.monthly_assigned,
        lb.carry_from_previous,
         lb.extra_leave, 
        lb.used,
        COALESCE(ud.paid_used, 0) AS paid_used,
        COALESCE(ud.unpaid_used, 0) AS unpaid_used
      FROM leave_balance lb
      LEFT JOIN employees e ON e.employee_code = lb.employee_code
      LEFT JOIN used_days ud ON ud.employee_code = lb.employee_code
      WHERE lb.year = $1 AND lb.month = $2
      ORDER BY e.employee_code;
    `, [currentYear, currentMonth]);

    return res.status(200).json(rows);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};



const getAllAllocations = async (req, res) => {
  const { year } = req.query;

  try {
    const { rows } = await pool.query(
      `SELECT year, month, paid
       FROM leave_allocations
       WHERE year = $1
       ORDER BY month ASC`,
      [Number(year)]
    );

    return res.status(200).json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};




const generateMonthlyBalanceForAll = async (req, res) => {
  try {
    const now = new Date();

    let startYear = now.getFullYear();
    let startMonth = now.getMonth() + 1;   // current month

    // SAME TEST LOGIC (optional testing next month)
    if (req.query.testNext === "true") {
      startMonth = startMonth + 1;
      if (startMonth === 13) {
        startMonth = 1;
        startYear += 1;
      }
    }

    const { rows: employees } = await pool.query(
      `SELECT employee_code FROM employees`
    );

    let created = 0;
    let skipped = 0;

    // ➤ Generate NEXT 12 MONTHS
    for (const emp of employees) {
      let year = startYear;
      let month = startMonth;

      for (let i = 0; i < 12; i++) {

        const exists = await getBalance(emp.employee_code, year, month);

        if (!exists) {
          await createBalanceForMonth(emp.employee_code, year, month);
          created++;
        } else {
          skipped++;
        }

        // Move to next month
        month++;
        if (month === 13) {
          month = 1;
          year++;
        }
      }
    }

    return res.status(200).json({
      message: "12 months leave_balance generated",
      startYear,
      startMonth,
      created,
      skipped
    });

  } catch (err) {
    console.error("generateMonthlyBalanceForAll error:", err);
    return res.status(500).json({ error: err.message });
  }
};





const addExtraLeave = async (req, res) => {
  try {
    const { employee_code, year, month, extra } = req.body;

    if (!employee_code || !year || !month || extra === undefined) {
      return res.status(400).json({
        error: "employee_code, year, month, extra are required"
      });
    }

    const result = await applyExtraLeave(
      employee_code,
      Number(year),
      Number(month),
      Number(extra)
    );

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    // Recalculate approved leaves after extra leave changes
    const recalcResult = await recalculateApprovedLeaves(employee_code);

    return res.status(200).json({
      message: "Extra leave added and approved leaves recalculated",
      recalculated: recalcResult.recalculated
    });

  } catch (err) {
    console.error("addExtraLeave error:", err);
    return res.status(500).json({ error: err.message });
  }
};






/**
 * Get all extra leave for all employees
 */
const getAllExtraLeaveData = async (req, res) => {
  try {
    const data = await getAllExtraLeave();
    return res.status(200).json(data);
  } catch (err) {
    console.error("getAllExtraLeaveData error:", err);
    return res.status(500).json({ error: err.message });
  }
};


module.exports = {
  setAllocation,
  applyLeave,
  changeLeaveStatus,
  listAllLeaves,
  myLeaves,
  getAllEmployeeLeaveSummary,
  generateMonthlyBalanceForAll,
  getAllAllocations,
  addExtraLeave,
  getAllExtraLeaveData
};
