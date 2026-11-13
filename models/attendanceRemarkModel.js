const pool = require("../config/db");

class AttendanceRemarkModel {
  static async createRemark({
    employee_code,
    attendance_date,
    old_clock_in,
    old_clock_out,
    new_clock_in,
    new_clock_out,
    remark_text,
  }) {
    const query = `
      INSERT INTO remarks
      (
        employee_code,
        attendance_date,
        old_clock_in,
        old_clock_out,
        new_clock_in,
        new_clock_out,
        remark_text,
        status,
        created_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',NOW())
      RETURNING *;
    `;

    const result = await pool.query(query, [
      employee_code,
      attendance_date,
      old_clock_in,
      old_clock_out,
      new_clock_in,
      new_clock_out,
      remark_text,
    ]);

    return result.rows[0];
  }

  static async getMyRemarks(employee_code) {
    const result = await pool.query(
      `
        SELECT * 
        FROM remarks
        WHERE employee_code = $1
        ORDER BY id DESC
      `,
      [employee_code]
    );

    return result.rows;
  }

  static async getPendingRemarks() {
    const result = await pool.query(
      `
        SELECT *
        FROM remarks
        WHERE status = 'pending'
        ORDER BY created_at DESC
      `
    );

    return result.rows;
  }

  static async updateStatus(id, status, admin_response) {
    const result = await pool.query(
      `
        UPDATE remarks
        SET status = $1,
            admin_response = $2,
            resolved_at = NOW()
        WHERE id = $3
        RETURNING *;
      `,
      [status, admin_response, id]
    );

    return result.rows[0];
  }
}

module.exports = AttendanceRemarkModel;
