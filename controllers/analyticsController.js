const SpeciesReport = require("../models/SpeciesReport");
const Species = require("../models/Species");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/analytics/species-count
const speciesCount = asyncHandler(async (req, res) => {
  const data = await SpeciesReport.aggregate([
    { $match: { status: "approved" } },
    { $group: { _id: "$speciesName", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 },
  ]);
  res.json(data.map((d) => ({ label: d._id || "Unknown", value: d.count })));
});

// GET /api/analytics/monthly-trends
const monthlyTrends = asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const data = await SpeciesReport.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`),
        },
      },
    },
    {
      $group: {
        _id: { month: { $month: "$createdAt" }, status: "$status" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.month": 1 } },
  ]);

  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const result = months.map((m, i) => {
    const pending =
      data.find((d) => d._id.month === i + 1 && d._id.status === "pending")
        ?.count || 0;
    const approved =
      data.find((d) => d._id.month === i + 1 && d._id.status === "approved")
        ?.count || 0;
    const rejected =
      data.find((d) => d._id.month === i + 1 && d._id.status === "rejected")
        ?.count || 0;
    return {
      month: m,
      pending,
      approved,
      rejected,
      total: pending + approved + rejected,
    };
  });
  res.json(result);
});

// GET /api/analytics/region-summary
const regionSummary = asyncHandler(async (req, res) => {
  const data = await SpeciesReport.aggregate([
    { $match: { status: "approved", "location.regionName": { $ne: "" } } },
    {
      $group: {
        _id: "$location.regionName",
        count: { $sum: 1 },
        avgIndividuals: { $avg: "$numberOfIndividuals" },
        riskBreakdown: {
          $push: "$riskLevel",
        },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  res.json(
    data.map((d) => ({
      region: d._id,
      reportCount: d.count,
      avgIndividuals: Math.round(d.avgIndividuals),
      highRisk: d.riskBreakdown.filter((r) => r === "High" || r === "Critical")
        .length,
    })),
  );
});

// GET /api/analytics/comparison
const comparison = asyncHandler(async (req, res) => {
  const [
    totalReports,
    approvedReports,
    pendingReports,
    totalSpecies,
    totalUsers,
  ] = await Promise.all([
    SpeciesReport.countDocuments(),
    SpeciesReport.countDocuments({ status: "approved" }),
    SpeciesReport.countDocuments({ status: "pending" }),
    Species.countDocuments(),
    require("../models/User").countDocuments(),
  ]);

  const conservationBreakdown = await Species.aggregate([
    { $group: { _id: "$conservationStatus", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  const habitatBreakdown = await SpeciesReport.aggregate([
    { $match: { status: "approved" } },
    { $group: { _id: "$habitatType", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  res.json({
    totals: {
      totalReports,
      approvedReports,
      pendingReports,
      totalSpecies,
      totalUsers,
    },
    conservationBreakdown: conservationBreakdown.map((d) => ({
      label: d._id,
      value: d.count,
    })),
    habitatBreakdown: habitatBreakdown.map((d) => ({
      label: d._id,
      value: d.count,
    })),
  });
});

// GET /api/analytics/heatmap
const getHeatmapData = asyncHandler(async (req, res) => {
  const { startDate, endDate, species, riskLevel, zoom, bounds } = req.query;

  // Build query
  const query = {
    status: "approved",
    "location.coordinates": { $exists: true, $ne: [] },
  };

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (species) {
    query.$or = [
      { speciesName: new RegExp(species, "i") },
      { speciesId: species },
    ];
  }

  if (riskLevel && ["Low", "Medium", "High", "Critical"].includes(riskLevel)) {
    query.riskLevel = riskLevel;
  }

  // Fetch reports with coordinates
  const reports = await SpeciesReport.find(query)
    .select("location.coordinates riskLevel numberOfIndividuals createdAt")
    .lean();

  // Determine grid precision based on zoom level (default: zoom 6)
  const zoomLevel = parseInt(zoom) || 6;
  // Higher zoom = more precision (smaller grid cells)
  // Zoom levels: 1-5: 5 degrees, 6-10: 1 degree, 11-15: 0.1 degrees, 16+: 0.01 degrees
  let gridPrecision;
  if (zoomLevel <= 5) gridPrecision = 5;
  else if (zoomLevel <= 10) gridPrecision = 1;
  else if (zoomLevel <= 15) gridPrecision = 0.1;
  else gridPrecision = 0.01;

  // Helper function to get grid cell key for aggregation
  const getGridKey = (lat, lng) => {
    const gridLat = Math.floor(lat / gridPrecision) * gridPrecision;
    const gridLng = Math.floor(lng / gridPrecision) * gridPrecision;
    return `${gridLat.toFixed(6)},${gridLng.toFixed(6)}`;
  };

  // Aggregate data points into grid cells
  const riskWeight = { Low: 1, Medium: 2, High: 3, Critical: 5 };
  const gridCells = {};

  reports.forEach((r) => {
    const [lng, lat] = r.location.coordinates;
    const gridKey = getGridKey(lat, lng);

    if (!gridCells[gridKey]) {
      gridCells[gridKey] = {
        lat:
          Math.floor(lat / gridPrecision) * gridPrecision + gridPrecision / 2,
        lng:
          Math.floor(lng / gridPrecision) * gridPrecision + gridPrecision / 2,
        intensity: 0,
        count: 0,
        reports: [],
      };
    }

    const intensity =
      (riskWeight[r.riskLevel] || 1) * (r.numberOfIndividuals || 1);
    gridCells[gridKey].intensity += intensity;
    gridCells[gridKey].count += 1;
    gridCells[gridKey].reports.push({
      date: r.createdAt,
      risk: r.riskLevel,
    });
  });

  // Convert aggregated grid cells to heatmap format: [lat, lng, intensity]
  const heatmapData = Object.values(gridCells).map((cell) => [
    cell.lat,
    cell.lng,
    cell.intensity,
  ]);

  // Sort by intensity for frontend optimization
  heatmapData.sort((a, b) => b[2] - a[2]);

  res.json({
    count: reports.length,
    gridCount: heatmapData.length,
    data: heatmapData,
    precision: gridPrecision,
    zoom: zoomLevel,
    aggregated: true,
  });
});

module.exports = {
  speciesCount,
  monthlyTrends,
  regionSummary,
  comparison,
  getHeatmapData,
};
