



// const pool = require('../config/db');

// // ✅ Insert or update company setting
// const upsertCompanySetting = async ({
//   start_date,
//   end_date,
//   work_start,
//   work_end,
//   required_hours,
//   weekend_days,
//   is_default,
//   updated_by
// }) => {
//   // Convert float to hour + minute
//   const hours = Math.floor(required_hours);
//   const minutes = Math.round((required_hours - hours) * 60);
// const sql = `
//   INSERT INTO company_settings
//     (start_date, end_date, work_start, work_end,
//      required_hours, weekend_days, is_default, updated_by)
//   VALUES ($1, $2, $3, $4, make_interval(hours => $5, mins => $6), $7::varchar[], $8, $9)
//   ON CONFLICT (start_date, end_date)
//      DO UPDATE SET
//        work_start = EXCLUDED.work_start,
//        work_end = EXCLUDED.work_end,
//        required_hours = EXCLUDED.required_hours,
//        weekend_days = EXCLUDED.weekend_days::varchar[],
//        is_default = EXCLUDED.is_default,
//        updated_by = EXCLUDED.updated_by,
//        updated_at = CURRENT_TIMESTAMP
//   RETURNING *;
// `;


//   const { rows } = await pool.query(sql, [
//     start_date,
//     end_date,
//     work_start,
//     work_end,
//     hours,
//     minutes,
//     weekend_days,
//     is_default,
//     updated_by,
//   ]);

//   return rows[0];
// };


// // ✅ Return all company settings with proper required_hours (JSON)
// const getAllCompanySettings = async () => {
//   const { rows } = await pool.query(`
//     SELECT 
//       id,
//       TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
//       TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
//       work_start,
//       work_end,
//       json_build_object(
//         'hours', EXTRACT(HOUR FROM required_hours),
//         'minutes', EXTRACT(MINUTE FROM required_hours)
//       ) AS required_hours,
//       weekend_days,
//       updated_at,
//       updated_by,
//       is_default
//     FROM company_settings
//     ORDER BY start_date DESC NULLS LAST;
//   `);
//   return rows;
// };


// // ✅ Get company setting BY DATE with proper required_hours (JSON)
// const getCompanySettingByDate = async (date) => {
//   const { rows } = await pool.query(`
//     SELECT 
//       id, 
//       work_start, 
//       work_end, 
//       json_build_object(
//         'hours', EXTRACT(HOUR FROM required_hours),
//         'minutes', EXTRACT(MINUTE FROM required_hours)
//       ) AS required_hours,
//       weekend_days, 
//       updated_at, 
//       updated_by, 
//       start_date, 
//       end_date, 
//       is_default
//     FROM company_settings
//     WHERE ($1 BETWEEN start_date AND COALESCE(end_date, $1))
//        OR (is_default = true)
//     ORDER BY is_default ASC
//     LIMIT 1;
//   `, [date]);

//   return rows[0];
// };


// module.exports = { 
//   upsertCompanySetting, 
//   getAllCompanySettings, 
//   getCompanySettingByDate 
// };


const pool = require('../config/db');

// =======================================================================
//  INSERT / UPDATE COMPANY SETTINGS (DEFAULT + NON-DEFAULT)
// =======================================================================
const upsertCompanySetting = async ({
  start_date,
  end_date,
  work_start,
  work_end,
  required_hours,
  weekend_days,
  is_default,
  updated_by
}) => {

  // Normalize weekend array
  const weekendArray = Array.isArray(weekend_days)
    ? weekend_days
    : String(weekend_days).split(",").map((d) => d.trim());

  // ---------------------------------------------------------
  // 1️⃣ HANDLE DEFAULT SETTING (must update, not insert)
  // ---------------------------------------------------------
  if (is_default) {
    const { rows: existingDefault } = await pool.query(`
      SELECT id FROM company_settings WHERE is_default = true LIMIT 1;
    `);

    if (existingDefault.length > 0) {
      // UPDATE existing default row
      const sql = `
        UPDATE company_settings
           SET work_start = $1,
               work_end = $2,
               required_hours = make_interval(hours => $3),
               weekend_days = $4,
               updated_by = $5,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING *;
      `;

      const { rows } = await pool.query(sql, [
        work_start,
        work_end,
        required_hours,
        weekendArray,
        updated_by,
        existingDefault[0].id
      ]);

      return rows[0];
    }

    // No default exists → insert new default row
    const sqlInsertDefault = `
      INSERT INTO company_settings
        (start_date, end_date, work_start, work_end, required_hours,
         weekend_days, is_default, updated_by)
      VALUES (NULL, NULL, $1, $2, make_interval(hours => $3), $4, true, $5)
      RETURNING *;
    `;
    const { rows } = await pool.query(sqlInsertDefault, [
      work_start,
      work_end,
      required_hours,
      weekendArray,
      updated_by
    ]);
    return rows[0];
  }

  // ---------------------------------------------------------
  // 2️⃣ NON-DEFAULT RANGE-BASED SETTING
  // ---------------------------------------------------------
  const sql = `
    INSERT INTO company_settings
      (start_date, end_date, work_start, work_end,
       required_hours, weekend_days, is_default, updated_by)
    VALUES ($1, $2, $3, $4, make_interval(hours => $5), $6, false, $7)
    ON CONFLICT (start_date, end_date)
       DO UPDATE SET
         work_start = EXCLUDED.work_start,
         work_end = EXCLUDED.work_end,
         required_hours = EXCLUDED.required_hours,
         weekend_days = EXCLUDED.weekend_days,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const { rows } = await pool.query(sql, [
    start_date,
    end_date,
    work_start,
    work_end,
    required_hours,
    weekendArray,
    updated_by
  ]);

  return rows[0];
};





// =======================================================================
//  GET ALL COMPANY SETTINGS
// =======================================================================
const getAllCompanySettings = async () => {
  const { rows } = await pool.query(`
    SELECT 
      id,
      TO_CHAR(start_date, 'YYYY-MM-DD') AS start_date,
      TO_CHAR(end_date, 'YYYY-MM-DD') AS end_date,
      work_start,
      work_end,
      json_build_object(
        'hours', EXTRACT(HOUR FROM required_hours),
        'minutes', EXTRACT(MINUTE FROM required_hours)
      ) AS required_hours,
      weekend_days,
      updated_at,
      updated_by,
      is_default
    FROM company_settings
    ORDER BY is_default DESC, start_date DESC NULLS LAST;
  `);
  return rows;
};


// =======================================================================
//  GET COMPANY SETTING FOR A SPECIFIC DATE
// =======================================================================
const getCompanySettingByDate = async (date) => {
  const { rows } = await pool.query(`
    SELECT 
      id, 
      work_start, 
      work_end, 
      json_build_object(
        'hours', EXTRACT(HOUR FROM required_hours),
        'minutes', EXTRACT(MINUTE FROM required_hours)
      ) AS required_hours,
      weekend_days, 
      updated_at, 
      updated_by, 
      start_date, 
      end_date, 
      is_default
    FROM company_settings
    WHERE ($1 BETWEEN start_date AND COALESCE(end_date, $1))
       OR (is_default = true)
    ORDER BY is_default DESC
    LIMIT 1;
  `, [date]);

  return rows[0];
};


// =======================================================================
//  EXPORTS
// =======================================================================
module.exports = { 
  upsertCompanySetting, 
  getAllCompanySettings, 
  getCompanySettingByDate 
};
