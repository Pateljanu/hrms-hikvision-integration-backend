const express = require('express');
const { verifyAdmin, verifyToken } = require('../middlewares/authMiddleware');
const {
  setCompanySetting,      // create or update company working hours
  listCompanySettings,    // list all company setting records
  getSettingByDate        // fetch applicable setting for a given date
} = require('../controllers/companySettingsController');

const router = express.Router();

/* ==============================================================
   Company Settings Routes
   - All data related to working hours configuration
   ============================================================== */

// Admin-only: create or update company-wide working hours (specific date range or default)
router.post('/', verifyAdmin, setCompanySetting);

// Admin-only: get all saved configurations
router.post('/all-settings', verifyAdmin, listCompanySettings);

// Any logged-in user: get the work schedule that applies to a given date
// Example: /api/company-settings/by-date?date=2025-01-10
router.post('/by-date', verifyToken, getSettingByDate);

module.exports = router;