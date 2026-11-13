// routes/remarkRoutes.js

const express = require("express");
const router = express.Router();

// correct import
const { verifyToken, verifyAdmin } = require("../middlewares/authMiddleware");

const {
  createEmployeeRemark,
  getMyRemarks,
  getAdminPendingRemarks,
  acceptRemark,
  rejectRemark,
} = require("../controllers/remarkController");

// ============================================
// EMPLOYEE ROUTES
// ============================================

// Employee -> Submit new remark
router.post("/create", verifyToken, createEmployeeRemark);

// Employee -> View their own remarks + status
router.post("/my", verifyToken, getMyRemarks);


// ============================================
// ADMIN ROUTES
// ============================================

// Admin -> View all pending remark requests
router.post("/pending", verifyAdmin, getAdminPendingRemarks);

// Admin -> Accept remark
router.put("/accept/:id", verifyAdmin, acceptRemark);

// Admin -> Reject remark
router.put("/reject/:id", verifyAdmin, rejectRemark);


module.exports = router;
