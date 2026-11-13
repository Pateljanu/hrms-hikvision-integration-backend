const pool = require("../config/db");

// Add a holiday
const addHoliday = async ({ holiday_date, title, description, created_by }) => {
  const { rows } = await pool.query(
    `
    INSERT INTO holidays (holiday_date, title, description, created_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (holiday_date)
    DO UPDATE SET 
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      created_by = EXCLUDED.created_by,
      created_at = CURRENT_TIMESTAMP
    RETURNING *;
    `,
    [holiday_date, title, description, created_by]
  );
  return rows[0];
};

// Get all holidays
const getHolidays = async () => {
  const { rows } = await pool.query(`
    SELECT id, holiday_date, title, description, created_by, created_at
    FROM holidays
    ORDER BY holiday_date ASC;
  `);
  return rows;
};

// Delete holiday
const deleteHoliday = async (id) => {
  await pool.query(`DELETE FROM holidays WHERE id = $1`, [id]);
};

const getHolidayByDate = async (holiday_date) => {
  const { rows } = await pool.query(
    `SELECT * FROM holidays WHERE holiday_date::DATE = $1::DATE`,
    [holiday_date]
  );
  return rows.length > 0 ? rows[0] : null;
};

module.exports = { addHoliday, getHolidays, deleteHoliday,getHolidayByDate };
