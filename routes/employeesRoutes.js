const express = require('express');
const {
  listEmployees,
  getEmployee,
  createOrUpdateEmployee,
  removeEmployee,
  sendPasswordSetupLink,     // ADD THIS
  setPasswordFromToken
} = require('../controllers/employeesController');
const { loginEmployee } = require('../controllers/authController');
const { verifyToken, verifyAdmin } = require('../middlewares/authMiddleware');


const router = express.Router();

// Auth
router.post('/login', loginEmployee);

// Admin-only routes
router.post('/', verifyAdmin, createOrUpdateEmployee);
router.delete('/:code', verifyAdmin, removeEmployee);

// Any logged-in user
router.post('/all-employees', verifyToken, listEmployees);
router.post('/employee/:code', verifyToken, getEmployee);


// Admin sends email to employee for password setup
router.post('/send-password-link', verifyAdmin, sendPasswordSetupLink);

// Employee sets password using token
router.post('/set-password', setPasswordFromToken);

module.exports = router;