// const bcrypt = require('bcrypt');
// const jwt = require('jsonwebtoken');
// const { getEmployeeByCode } = require('../models/employeesModel');


// // Secret key for token — ideally keep this in process.env.JWT_SECRET
// const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key';

// const loginEmployee = async (req, res) => {
//   try {
//     const { employee_code, password } = req.body;

//     // Basic input validation
//     if (!employee_code || !password)
//       return res.status(400).json({ message: 'employee_code and password required' });

//     // Find employee in the database
//     const employee = await getEmployeeByCode(employee_code);
//     if (!employee)
//       return res.status(404).json({ message: 'Employee not found' });

//     // Compare password with stored hash
//     const isMatch = await bcrypt.compare(password, employee.password_hash);
//     if (!isMatch)
//       return res.status(401).json({ message: 'Invalid password' });

//     // Create JWT token
//     const token = jwt.sign(
//       {
//         employee_code: employee.employee_code,
//         full_name: employee.full_name,
//         role: employee.role
//       },
//       JWT_SECRET,
//       { expiresIn: '1h' } // valid for 1 hour
//     );

//     // Exclude sensitive data when returning
//     delete employee.password_hash;

//     res.status(200).json({
//       message: 'Login successful',
//       token,
//       employee
//     });

//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// module.exports = { loginEmployee };


const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { getEmployeeByCode } = require('../models/employeesModel');
const { generateMonthlyBalanceForAll } = require('../controllers/leaveController');

const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key';

const loginEmployee = async (req, res) => {
  try {
    const { employee_code, password } = req.body;

    if (!employee_code || !password)
      return res.status(400).json({ message: 'employee_code and password required' });

    const employee = await getEmployeeByCode(employee_code);
    if (!employee)
      return res.status(404).json({ message: 'Employee not found' });

    const isMatch = await bcrypt.compare(password, employee.password_hash);
    if (!isMatch)
      return res.status(401).json({ message: 'Invalid password' });

    const token = jwt.sign(
      {
        employee_code: employee.employee_code,
        full_name: employee.full_name,
        role: employee.role
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    delete employee.password_hash;

    /** ------------------------------------------
     *  AUTO-GENERATE MONTHLY BALANCE ON ADMIN LOGIN
     * ------------------------------------------ */
    if (employee.role === 'admin') {
      try {
        // Call backend function without sending response twice
        await generateMonthlyBalanceForAll(
          { query: {} },                       // req substitute
          { status: () => ({ json: () => {} }) } // dummy res substitute
        );
        console.log("✔ Auto monthly leave balance generated on admin login");
      } catch (err) {
        console.error("⚠ Failed to auto-generate balance:", err.message);
      }
    }

    return res.status(200).json({
      message: 'Login successful',
      token,
      employee
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

module.exports = { loginEmployee };
