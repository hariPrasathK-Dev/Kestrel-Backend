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
  const { startDate, endDate, species, riskLevel } = req.query;

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
    .select("location.coordinates riskLevel numberOfIndividuals")
    .lean();

  // Convert to heatmap format: [lat, lng, intensity]
  const riskWeight = { Low: 1, Medium: 2, High: 3, Critical: 5 };
  const heatmapData = reports.map((r) => {
    const [lng, lat] = r.location.coordinates;
    const intensity =
      (riskWeight[r.riskLevel] || 1) * (r.numberOfIndividuals || 1);
    return [lat, lng, intensity];
  });

  res.json({
    count: heatmapData.length,
    data: heatmapData,
  });
});

module.exports = {
  speciesCount,
  monthlyTrends,
  regionSummary,
  comparison,
  getHeatmapData,
};
