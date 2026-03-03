const express = require("express");
const router = express.Router();
const {
    getAllRegions,
    getRegionById,
    createRegion,
    updateRegion,
    deleteRegion,
} = require("../controllers/regionController");
const { protect } = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleGuard");

router.get("/", protect, getAllRegions);
router.get("/:id", protect, getRegionById);
router.post("/", protect, requireRole("officer", "admin"), createRegion);
router.put("/:id", protect, requireRole("officer", "admin"), updateRegion);
router.delete("/:id", protect, requireRole("admin"), deleteRegion);

module.exports = router;
