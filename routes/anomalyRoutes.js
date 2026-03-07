const express = require("express");
const router = express.Router();
const { getAnomalies, getStats, createAnomaly, reviewAnomaly, deleteAnomaly, runDetection } = require("../controllers/anomalyController");
const { protect } = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleGuard");

router.get("/", protect, getAnomalies);
router.get("/stats", protect, getStats);
router.post("/", protect, createAnomaly);
router.post("/detect", protect, requireRole("officer", "admin"), runDetection);
router.patch("/:id/review", protect, requireRole("officer", "admin"), reviewAnomaly);
router.delete("/:id", protect, requireRole("admin"), deleteAnomaly);

module.exports = router;
