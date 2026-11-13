// routes/leaveRoutes.js
const express = require("express");
const router = express.Router();

const {
  setAllocation,
  applyLeave,
  changeLeaveStatus,
  listAllLeaves,
  myLeaves,
  getAllEmployeeLeaveSummary,
  getAllAllocations,
  addExtraLeave,
  getAllExtraLeaveData

} = require("../controllers/leaveController");
const { generateMonthlyBalanceForAll } = require("../controllers/leaveController");

const { verifyToken, verifyAdmin } = require("../middlewares/authMiddleware");

// =======================
// EMPLOYEE ROUTES
// =======================

// Apply for leave
router.post("/apply", verifyToken, applyLeave);

// My leaves + current month balance
router.post("/my", verifyToken, myLeaves);

// =======================
// ADMIN ROUTES
// =======================

// Set monthly allocation rule
router.post("/admin/allocate", verifyAdmin, setAllocation);

// Approve / Reject leave
router.put("/:id", verifyAdmin, changeLeaveStatus);

// List all leaves
router.post("/all-leaves", verifyAdmin, listAllLeaves);

router.post("/admin/balances", verifyAdmin, getAllEmployeeLeaveSummary);
router.post("/generate-month", generateMonthlyBalanceForAll);
router.post("/admin/all-allocations", verifyAdmin, getAllAllocations);
router.post("/admin/add-extra-leave", addExtraLeave);
router.post("/admin/all-extra-leave", verifyAdmin, getAllExtraLeaveData);







module.exports = router;
