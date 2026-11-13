const pool = require('../config/db');

// Fetch all employees
const getAllEmployees = async () => {
  const { rows } = await pool.query('SELECT * FROM employees ORDER BY employee_code');
  return rows;
};

// Fetch employee by code
const getEmployeeByCode = async (code) => {
  const { rows } = await pool.query('SELECT * FROM employees WHERE employee_code = $1', [code]);
  return rows[0];
};

// Insert or update employee (with password_hash)
const upsertEmployee = async (
  employee_code,
  full_name,
  email,
  role,
  status,
  password_hash
) => {
  const sql = `
    INSERT INTO employees (employee_code, full_name, email, role, status, password_hash)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (employee_code) DO UPDATE
    SET 
      full_name = EXCLUDED.full_name,
      email = COALESCE(EXCLUDED.email, employees.email),
      role = COALESCE(EXCLUDED.role, employees.role),
      status = COALESCE(EXCLUDED.status, employees.status),
      password_hash = COALESCE(EXCLUDED.password_hash, employees.password_hash)
    RETURNING *;
  `;
  const { rows } = await pool.query(sql, [
    employee_code,
    full_name,
    email,
    role,
    status,
    password_hash
  ]);
  return rows[0];
};

// Delete employee
const deleteEmployee = async (code) => {
  const { rowCount } = await pool.query('DELETE FROM employees WHERE employee_code = $1', [code]);
  return rowCount;
};

module.exports = {
  getAllEmployees,
  getEmployeeByCode,
  upsertEmployee,
  deleteEmployee
};  