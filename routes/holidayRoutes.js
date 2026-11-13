const express = require("express");
const router = express.Router();

const { verifyAdmin, verifyToken } = require("../middlewares/authMiddleware");
const { createHoliday, listHolidays, removeHoliday } = require("../controllers/holidayController");

// Admin adds/updates holiday
router.post("/", verifyAdmin, createHoliday);

// Admin or employee can see holidays
router.post("/all-holiday", verifyToken, listHolidays);

// Admin delete
router.delete("/:id", verifyAdmin, removeHoliday);

module.exports = router;
