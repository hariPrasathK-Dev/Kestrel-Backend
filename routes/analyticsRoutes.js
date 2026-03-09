const express = require("express");
const router = express.Router();
const {
  speciesCount,
  monthlyTrends,
  regionSummary,
  comparison,
  getHeatmapData,
} = require("../controllers/analyticsController");

router.get("/species-count", speciesCount);
router.get("/monthly-trends", monthlyTrends);
router.get("/region-summary", regionSummary);
router.get("/comparison", comparison);
router.get("/heatmap", getHeatmapData);

module.exports = router;
