
const pool = require('../config/db');

/**
 * Utility helpers
 */
function prevMonthYear(year, month) {
  let py = Number(year);
  let pm = Number(month) - 1;
  if (pm === 0) {
    pm = 12;
    py -= 1;
  }
  return { year: py, month: pm };
}

/**
 * ---------------------------
 * Allocation / Rule functions
 * ---------------------------
 */

const getAllocation = async (year, month) => {
  const { rows } = await pool.query(
    `SELECT * FROM leave_allocations WHERE year = $1 AND month = $2 LIMIT 1`,
    [Number(year), Number(month)]
  );
  return rows[0] || null;
};

const upsertAllocation = async (year, month, paid) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id FROM leave_allocations WHERE year = $1 AND month = $2 LIMIT 1`,
      [Number(year), Number(month)]
    );

    if (rows.length > 0) {
      const id = rows[0].id;
      const { rows: updated } = await client.query(
        `UPDATE leave_allocations
         SET paid = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [Number(paid), id]
      );
      await client.query('COMMIT');
      return updated[0];
    } else {
      const { rows: inserted } = await client.query(
        `INSERT INTO leave_allocations (year, month, paid, created_at, updated_at)
         VALUES ($1,$2,$3,NOW(),NOW()) RETURNING *`,
        [Number(year), Number(month), Number(paid)]
      );
      await client.query('COMMIT');
      return inserted[0];
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Get allocation for a specific month (exact match only)
 * Returns the allocation for that specific month, or null if not set
 */
const getRuleForMonth = async (targetYear, targetMonth) => {
  const { rows } = await pool.query(
    `SELECT * FROM leave_allocations
     WHERE year = $1 AND month = $2
     LIMIT 1`,
    [Number(targetYear), Number(targetMonth)]
  );
  return rows[0] || null;
};

/**
 * ---------------------------
 * Leave Balance functions (NO total_available)
 * ---------------------------
 *
 * remaining = monthly_assigned + carry_from_previous - used
 */

/**
 * Get existing leave_balance row for employee/year/month
 */
const getBalance = async (employee_code, year, month) => {
  const { rows } = await pool.query(
    `SELECT * FROM leave_balance WHERE employee_code = $1 AND year = $2 AND month = $3 LIMIT 1`,
    [employee_code, Number(year), Number(month)]
  );
  return rows[0] || null;
};

/**
 * Create leave balance for employee/year/month using rule lookup and previous carry.
 */
/**
 * Create leave balance for employee/year/month
 * Uses month-specific allocation if exists, otherwise defaults to 1
 */
const createBalanceForMonth = async (employee_code, year, month) => {
  const rule = await getRuleForMonth(year, month);
  // Default to 1 if no specific allocation for this month
  const monthly_assigned = rule ? Number(rule.paid || 0) : 1;

  const prev = await getBalance(employee_code, ...(() => {
    const p = prevMonthYear(year, month);
    return [p.year, p.month];
  })());

  const carry_from_previous = prev ? Number(prev.remaining || 0) : 0;

  const used = 0;
  const extra_leave = 0;

  const remaining = monthly_assigned + carry_from_previous + extra_leave - used;

  const { rows } = await pool.query(
    `INSERT INTO leave_balance
     (employee_code, year, month, monthly_assigned, carry_from_previous, extra_leave, used, remaining, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
     RETURNING *`,
    [employee_code, year, month, monthly_assigned, carry_from_previous, extra_leave, used, remaining]
  );

  return rows[0];
};


/**
 * When admin updates a rule for a specific month, adjust monthly_assigned for existing balances for that year/month,
 * and recompute remaining = monthly_assigned + carry_from_previous - used
 */
const adjustBalancesForAllocation = async (year, month, newPaid) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, monthly_assigned, carry_from_previous, extra_leave, used
       FROM leave_balance
       WHERE year=$1 AND month=$2
       FOR UPDATE`,
      [year, month]
    );

    for (const b of rows) {
      const monthly = Number(newPaid);
      const carry = Number(b.carry_from_previous);
      const extra = Number(b.extra_leave);
      const used = Number(b.used);

      const remaining = monthly + carry + extra - used;

      await client.query(
        `UPDATE leave_balance
         SET monthly_assigned=$1,
             remaining=$2,
             updated_at=NOW()
         WHERE id=$3`,
        [monthly, remaining, b.id]
      );
    }

    await client.query('COMMIT');
    return { updatedCount: rows.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};


/**
 * Atomically consume `count` paid leaves from a balance (update used and remaining).
 * Use FOR UPDATE to lock the row.
 */
const updateBalanceUse = async (balanceId, count) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM leave_balance WHERE id = $1 FOR UPDATE`,
      [balanceId]
    );

    if (rows.length === 0) throw new Error('Balance not found');

    const b = rows[0];
    const prevUsed = Number(b.used || 0);
    const newUsed = prevUsed + Number(count);

    const monthly_assigned = Number(b.monthly_assigned || 0);
    const carry = Number(b.carry_from_previous || 0);

    const extra = Number(b.extra_leave || 0);
    let newRemaining = monthly_assigned + carry + extra - newUsed;


    // ❗ FIX: never allow negative remaining
    if (newRemaining < 0) newRemaining = 0;

    const { rows: updated } = await client.query(
      `UPDATE leave_balance SET used = $1, remaining = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [newUsed, newRemaining, balanceId]
    );

    await client.query('COMMIT');
    return updated[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};


/**
 * ---------------------------
 * Leave request functions
 * ---------------------------
 */

const createLeaveRequest = async (employee_code, start_date, end_date, reason) => {
  const { rows } = await pool.query(
    `INSERT INTO leave_requests
     (employee_code, start_date, end_date, reason, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'Pending',NOW(),NOW())
     RETURNING *`,
    [employee_code, start_date, end_date, reason || null]
  );
  return rows[0];
};

const getLeaveRequestById = async (id) => {
  const { rows } = await pool.query(`SELECT * FROM leave_requests WHERE id = $1 LIMIT 1`, [id]);
  return rows[0] || null;
};

const updateLeaveRequestStatus = async (id, status, approved_by, paid_days = 0, unpaid_days = 0) => {
  const total_days = Number(paid_days || 0) + Number(unpaid_days || 0);
  const { rows } = await pool.query(
    `UPDATE leave_requests
     SET status = $1, approved_by = $2, approved_at = NOW(),
         paid_days = $3, unpaid_days = $4, total_days = $5, updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [status, approved_by, paid_days, unpaid_days, total_days, id]
  );
  return rows[0];
};

const listLeaves = async () => {
  const { rows } = await pool.query(`SELECT * FROM leave_requests ORDER BY id DESC`);
  return rows;
};

/**
 * Get balances summary for an employee (latest month only)
 * Now we return computed total_available as monthly_assigned + carry_from_previous (for UI convenience),
 * but we do NOT store total_available in DB.
 */
const getLatestBalanceSummary = async (employee_code) => {
  const { rows } = await pool.query(
    `SELECT monthly_assigned, carry_from_previous, used, remaining, year, month
     FROM leave_balance
     WHERE employee_code = $1
     ORDER BY year DESC, month DESC
     LIMIT 1`,
    [employee_code]
  );
  const r = rows[0] || null;
  if (!r) return null;
  const total_available = Number(r.monthly_assigned || 0) + Number(r.carry_from_previous || 0);
  return {
    monthly_assigned: Number(r.monthly_assigned || 0),
    carry_from_previous: Number(r.carry_from_previous || 0),
    total_available,
    used: Number(r.used || 0),
    remaining: Number(r.remaining || 0),
    year: r.year,
    month: r.month,
  };
};

/**
 * Helper: Count business days between start_date and end_date inclusive (skips Sat/Sun)
 */
const getBusinessDaysBetween = (start_date, end_date) => {
  const s = new Date(start_date);
  const e = new Date(end_date);
  const days = [];
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(new Date(d));
    }
  }
  return days;
};


/**
 * Recompute all future months for an employee after allocation update
 */
const recomputeFutureBalances = async (employee_code, startYear, startMonth, newPaid) => {
  let year = startYear;
  let month = startMonth;

  let startBal = await getBalance(employee_code, year, month);
  if (!startBal) return;

  let prevRemaining = Number(startBal.remaining);

  month++;
  if (month === 13) { month = 1; year++; }

  while (true) {
    const next = await getBalance(employee_code, year, month);
    if (!next) break;

    const assigned = Number(next.monthly_assigned);
    const used = Number(next.used);
    const extra = Number(next.extra_leave);

    const carry = prevRemaining;
    const remaining = assigned + carry + extra - used;

    await pool.query(
      `UPDATE leave_balance
       SET monthly_assigned=$1,
           carry_from_previous=$2,
           remaining=$3,
           updated_at=NOW()
       WHERE id=$4`,
      [newPaid, carry, remaining, next.id]
    );

    prevRemaining = remaining;

    month++;
    if (month === 13) { month = 1; year++; }
  }
};



const applyExtraLeave = async (employee_code, year, month, extra) => {
  extra = Number(extra);

  const bal = await getBalance(employee_code, year, month);
  if (!bal) return { error: "No balance for this month" };

  const monthly = Number(bal.monthly_assigned || 0);
  const carry = Number(bal.carry_from_previous || 0);
  const used = Number(bal.used || 0);
  const oldExtra = Number(bal.extra_leave || 0);

  const newExtra = oldExtra + extra;

  const newRemaining = monthly + carry + newExtra - used;

  // Update current month
  await pool.query(
    `UPDATE leave_balance
     SET extra_leave=$1, remaining=$2
     WHERE id=$3`,
    [newExtra, newRemaining, bal.id]
  );

  // Cascade future months
  let prevRemaining = newRemaining;

  let y = Number(year);
  let m = Number(month) + 1;
  if (m === 13) { m = 1; y++; }

  while (true) {
    const next = await getBalance(employee_code, y, m);
    if (!next) break;

    const nextAssigned = Number(next.monthly_assigned);
    const nextUsed = Number(next.used);

    const carryNext = prevRemaining;
    const extraNext = Number(next.extra_leave || 0);

    const newRem = nextAssigned + carryNext + extraNext - nextUsed;

    await pool.query(
      `UPDATE leave_balance
       SET carry_from_previous=$1, remaining=$2
       WHERE id=$3`,
      [carryNext, newRem, next.id]
    );

    prevRemaining = newRem;

    m++;
    if (m === 13) { m = 1; y++; }
  }

  return { success: true };
};


/**
 * Recalculate paid_days and unpaid_days for all approved leave requests of an employee
 * This should be called after balance changes (allocation update or extra leave)
 */
const recalculateApprovedLeaves = async (employee_code) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get all approved leaves for this employee
    const { rows: leaves } = await client.query(
      `SELECT id, employee_code, start_date, end_date
       FROM leave_requests
       WHERE employee_code = $1 AND status = 'Approved'
       ORDER BY start_date ASC`,
      [employee_code]
    );

    if (leaves.length === 0) {
      await client.query('COMMIT');
      return { recalculated: 0 };
    }

    // Reset all used values to 0 for this employee
    await client.query(
      `UPDATE leave_balance
       SET used = 0,
           remaining = monthly_assigned + carry_from_previous + extra_leave
       WHERE employee_code = $1`,
      [employee_code]
    );

    // Recalculate cascading remaining for future months
    await recalculateCascadingBalances(client, employee_code);

    // Now re-apply each approved leave in chronological order
    for (const leave of leaves) {
      const businessDays = getBusinessDaysBetween(leave.start_date, leave.end_date);

      // Group by year-month
      const byMonth = {};
      for (const d of businessDays) {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const key = `${y}-${m}`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      }

      let paidTotal = 0;
      let unpaidTotal = 0;

      // For each month group, consume leave
      for (const key of Object.keys(byMonth).sort()) {
        const [yStr, mStr] = key.split('-');
        const y = Number(yStr);
        const m = Number(mStr);
        const daysCount = Number(byMonth[key]);

        const { rows: balRows } = await client.query(
          `SELECT id, remaining FROM leave_balance
           WHERE employee_code = $1 AND year = $2 AND month = $3
           FOR UPDATE`,
          [employee_code, y, m]
        );

        if (balRows.length === 0) continue;

        const balance = balRows[0];
        const currentRemaining = Number(balance.remaining || 0);
        const paidToConsume = Math.max(0, Math.min(currentRemaining, daysCount));
        const unpaidForMonth = daysCount - paidToConsume;

        if (paidToConsume > 0) {
          // Update used and remaining
          const newUsed = await client.query(
            `UPDATE leave_balance
             SET used = used + $1,
                 remaining = remaining - $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING used`,
            [paidToConsume, balance.id]
          );
        }

        paidTotal += paidToConsume;
        unpaidTotal += unpaidForMonth;
      }

      // Update the leave request with recalculated values
      const total_days = paidTotal + unpaidTotal;
      await client.query(
        `UPDATE leave_requests
         SET paid_days = $1,
             unpaid_days = $2,
             total_days = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [paidTotal, unpaidTotal, total_days, leave.id]
      );
    }

    await client.query('COMMIT');
    return { recalculated: leaves.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Helper to recalculate cascading balance remainings after resetting used values
 */
const recalculateCascadingBalances = async (client, employee_code) => {
  // Get all balances for this employee in chronological order
  const { rows: balances } = await client.query(
    `SELECT id, year, month, monthly_assigned, carry_from_previous, extra_leave, used
     FROM leave_balance
     WHERE employee_code = $1
     ORDER BY year ASC, month ASC`,
    [employee_code]
  );

  let prevRemaining = 0;

  for (let i = 0; i < balances.length; i++) {
    const bal = balances[i];
    const monthly = Number(bal.monthly_assigned || 0);
    const extra = Number(bal.extra_leave || 0);
    const used = Number(bal.used || 0);

    // Carry should be the previous month's remaining
    const carry = prevRemaining;
    const remaining = monthly + carry + extra - used;

    await client.query(
      `UPDATE leave_balance
       SET carry_from_previous = $1,
           remaining = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [carry, remaining, bal.id]
    );

    prevRemaining = remaining;
  }
};





const getAllExtraLeave = async () => {
  const { rows } = await pool.query(
    `SELECT 
      lb.employee_code,
      e.full_name,
      lb.year,
      lb.month,
      lb.extra_leave
     FROM leave_balance lb
     JOIN employees e ON lb.employee_code = e.employee_code
     WHERE lb.extra_leave > 0
     ORDER BY lb.employee_code, lb.year, lb.month`
  );
  return rows;
};

module.exports = {
  // allocation/rule
  getAllocation,
  upsertAllocation,
  getRuleForMonth,
  // balances
  getBalance,
  createBalanceForMonth,
  adjustBalancesForAllocation,
  updateBalanceUse,
  getLatestBalanceSummary,
  // leave requests
  createLeaveRequest,
  getLeaveRequestById,
  updateLeaveRequestStatus,
  listLeaves,
  // helpers
  getBusinessDaysBetween,
  recomputeFutureBalances,
  applyExtraLeave,
  recalculateApprovedLeaves,
  getAllExtraLeave
};

/**
 * Get all extra leave for all employees across all months
 * Returns only records where extra_leave > 0
 */
