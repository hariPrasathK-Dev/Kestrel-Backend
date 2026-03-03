const express = require("express");
const router = express.Router();
const { getAnomalies, createAnomaly, reviewAnomaly, deleteAnomaly } = require("../controllers/anomalyController");
const { protect } = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleGuard");

router.get("/", protect, getAnomalies);
router.post("/", protect, createAnomaly);
router.patch("/:id/review", protect, requireRole("officer", "admin"), reviewAnomaly);
router.delete("/:id", protect, requireRole("admin"), deleteAnomaly);

module.exports = router;
