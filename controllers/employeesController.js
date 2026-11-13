const bcrypt = require('bcrypt');
const {
  getAllEmployees,
  getEmployeeByCode,
  upsertEmployee,
  deleteEmployee
} = require('../models/employeesModel');
const pool = require('../config/db');
const crypto = require("crypto");
const nodemailer = require("nodemailer");


// ===============================
// ADMIN — Send Password Setup Link
// ===============================

const sendPasswordSetupLink = async (req, res) => {
  console.log("📩 API HIT: /send-password-link");

  try {
    const { employee_code } = req.body;

    const emp = await getEmployeeByCode(employee_code);
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    if (!emp.email) return res.status(400).json({ message: "Employee email is missing" });

    // Generate token
    const token = crypto.randomBytes(32).toString("hex");

    // Save token in DB
    await pool.query(
      `UPDATE employees
         SET password_token = $1, password_token_expiry = NOW() + INTERVAL '1 day'
       WHERE employee_code = $2`,
      [token, employee_code]
    );

    // AUTO-SWITCH URL (LOCAL / LIVE)
    // AUTO PICK FRONTEND DOMAIN FROM .env
const BASE_URL = process.env.FRONTEND_URL || "http://localhost:5173";


    const link = `${BASE_URL}/set-password?token=${token}`;


    // SMTP
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Acusion" <${process.env.MAIL_USER}>`,
      to: emp.email,
      subject: "Set Your Password",
      html: `
        <h3>Hello ${emp.full_name},</h3>
        <p>You requested to set your account password.</p>

        <a href="${link}" 
           style="background:#1d4ed8;padding:12px 18px;color:white;text-decoration:none;border-radius:6px;font-size:16px;">
          Set Your Password
        </a>

        <p>This link expires in 24 hours.</p>
      `,
    });

    res.json({ message: "Password setup link sent successfully!" });

  } catch (err) {
    console.log("🔥 ERROR OCCURRED:", err);
    res.status(500).json({ error: err.message });
  }
};




// ===============================
// EMPLOYEE — Set Password Using Token
// ===============================
const setPasswordFromToken = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword)
      return res.status(400).json({ message: "token and newPassword required" });

    // Verify token
    const { rows } = await pool.query(
      `SELECT * FROM employees
       WHERE password_token = $1
       AND password_token_expiry > NOW()`,
      [token]
    );

    if (rows.length === 0)
      return res.status(400).json({ message: "Invalid or expired token" });

    const employee = rows[0];

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);

    // Save password + clear token
    await pool.query(
      `UPDATE employees
       SET password_hash = $1,
           password_token = NULL,
           password_token_expiry = NULL
       WHERE employee_code = $2`,
      [password_hash, employee.employee_code]
    );

    res.json({ message: "Password set successfully! You can now login." });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ===============================
// GET ALL EMPLOYEES
// ===============================
const listEmployees = async (req, res) => {
  try {
    const data = await getAllEmployees();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ===============================
// GET EMPLOYEE BY CODE
// ===============================
const getEmployee = async (req, res) => {
  try {
    const emp = await getEmployeeByCode(req.params.code);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    res.status(200).json(emp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ===============================
// CREATE OR UPDATE EMPLOYEE
// ===============================
const createOrUpdateEmployee = async (req, res) => {
  try {
    let { employee_code, full_name, email, role, status } = req.body;

    if (!employee_code || !full_name)
      return res.status(400).json({ message: 'employee_code and full_name required' });

    const allowedRoles = ['admin', 'employee'];
    if (role && !allowedRoles.includes(role))
      return res.status(400).json({ message: 'role must be admin or employee' });

    if (!role) role = 'employee';

    let password_hash = null; // admin not setting password

    const result = await upsertEmployee(
      employee_code,
      full_name,
      email,
      role,
      status,
      password_hash
    );

    res.status(201).json(result);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ===============================
// DELETE EMPLOYEE
// ===============================
const removeEmployee = async (req, res) => {
  try {
    const deleted = await deleteEmployee(req.params.code);
    if (!deleted) return res.status(404).json({ message: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



module.exports = {
  listEmployees,
  getEmployee,
  createOrUpdateEmployee,
  removeEmployee,
  sendPasswordSetupLink,
  setPasswordFromToken
};
