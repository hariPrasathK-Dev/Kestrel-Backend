const express = require("express");
const router = express.Router();
const { getAlerts, createAlert, updateAlert, deleteAlert, addFeedback } = require("../controllers/alertController");
const { protect } = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleGuard");

router.get("/", protect, getAlerts);
router.post("/", protect, requireRole("officer", "admin"), createAlert);
router.put("/:id", protect, requireRole("officer", "admin"), updateAlert);
router.delete("/:id", protect, requireRole("admin"), deleteAlert);
router.post("/:id/feedback", protect, addFeedback);

module.exports = router;
