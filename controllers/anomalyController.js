const Anomaly = require("../models/Anomaly");
const SpeciesReport = require("../models/SpeciesReport");
const Alert = require("../models/Alert");
const asyncHandler = require("../utils/asyncHandler");

// Helper: Calculate standard deviation
function stdDev(values) {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
}

// GET /api/anomalies - Get all anomalies with filters
const getAnomalies = asyncHandler(async (req, res) => {
    const { status, type, severity } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;

    const anomalies = await Anomaly.find(filter)
        .populate("reportedBy", "name")
        .sort({ detectedAt: -1 });
    
    res.json(anomalies);
});

// GET /api/anomalies/stats - Get anomaly statistics
const getStats = asyncHandler(async (req, res) => {
    const totalAnomalies = await Anomaly.countDocuments();
    const openAnomalies = await Anomaly.countDocuments({ status: "open" });
    const criticalAnomalies = await Anomaly.countDocuments({ severity: "Critical" });
    
    const typeBreakdown = await Anomaly.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);

    const severityBreakdown = await Anomaly.aggregate([
        { $group: { _id: "$severity", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);

    const recentTrend = await Anomaly.aggregate([
        {
            $match: {
                detectedAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } // Last 90 days
            }
        },
        {
            $group: {
                _id: {
                    month: { $month: "$detectedAt" },
                    year: { $year: "$detectedAt" }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    res.json({
        totals: {
            total: totalAnomalies,
            open: openAnomalies,
            critical: criticalAnomalies,
        },
        typeBreakdown,
        severityBreakdown,
        recentTrend,
    });
});

const createAnomaly = asyncHandler(async (req, res) => {
    const anomaly = await Anomaly.create({ 
        ...req.body, 
        reportedBy: req.user._id,
        detectionMethod: "manual"
    });
    res.status(201).json(anomaly);
});

const reviewAnomaly = asyncHandler(async (req, res) => {
    const { status, reviewNotes } = req.body;
    const anomaly = await Anomaly.findByIdAndUpdate(
        req.params.id,
        { status, reviewNotes },
        { new: true }
    );
    if (!anomaly) return res.status(404).json({ message: "Anomaly not found" });
    res.json(anomaly);
});

const deleteAnomaly = asyncHandler(async (req, res) => {
    const a = await Anomaly.findByIdAndDelete(req.params.id);
    if (!a) return res.status(404).json({ message: "Anomaly not found" });
    res.json({ message: "Anomaly deleted" });
});

// POST /api/anomalies/detect - Run automated anomaly detection (Admin only)
const runDetection = asyncHandler(async (req, res) => {
    const detectedAnomalies = [];

    try {
        // 1. Detect Population Decline by Species
        const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const last60Days = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

        const speciesCounts = await SpeciesReport.aggregate([
            { $match: { status: "approved" } },
            {
                $group: {
                    _id: {
                        species: "$speciesName",
                        region: "$location.regionName",
                        period: {
                            $cond: {
                                if: { $gte: ["$createdAt", last30Days] },
                                then: "recent",
                                else: "previous"
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Group by species and region
        const speciesMap = {};
        speciesCounts.forEach(item => {
            const key = `${item._id.species}:${item._id.region}`;
            if (!speciesMap[key]) {
                speciesMap[key] = { species: item._id.species, region: item._id.region, recent: 0, previous: 0 };
            }
            if (item._id.period === "recent") {
                speciesMap[key].recent = item.count;
            } else {
                speciesMap[key].previous = item.count;
            }
        });

        // Check for significant declines (>50% drop)
        for (const key in speciesMap) {
            const data = speciesMap[key];
            if (data.previous > 0 && data.recent < data.previous * 0.5) {
                // Check if anomaly already exists
                const existing = await Anomaly.findOne({
                    type: "Population Decline",
                    region: data.region,
                    description: { $regex: data.species, $options: "i" },
                    status: { $ne: "resolved" }
                });

                if (!existing) {
                    const anomaly = await Anomaly.create({
                        region: data.region,
                        type: "Population Decline",
                        severity: "High",
                        description: `Significant decline detected for ${data.species}: from ${data.previous} reports (30-60 days ago) to ${data.recent} reports (last 30 days)`,
                        detectionMethod: "automated",
                        status: "open"
                    });
                    detectedAnomalies.push(anomaly);
                }
            }
        }

        // 2. Detect High-Risk Clusters (multiple Critical reports in same region)
        const riskClusters = await SpeciesReport.aggregate([
            {
                $match: {
                    status: "approved",
                    riskLevel: "Critical",
                    createdAt: { $gte: last30Days }
                }
            },
            {
                $group: {
                    _id: "$location.regionName",
                    count: { $sum: 1 },
                    species: { $addToSet: "$speciesName" }
                }
            },
            { $match: { count: { $gte: 3 } } }
        ]);

        for (const cluster of riskClusters) {
            const existing = await Anomaly.findOne({
                type: "Disease Outbreak",
                region: cluster._id,
                status: { $ne: "resolved" },
                detectedAt: { $gte: last30Days }
            });

            if (!existing) {
                const anomaly = await Anomaly.create({
                    region: cluster._id,
                    type: "Disease Outbreak",
                    severity: "Critical",
                    description: `High concentration of critical risk reports detected: ${cluster.count} reports affecting ${cluster.species.join(", ")}`,
                    detectionMethod: "automated",
                    status: "open"
                });
                detectedAnomalies.push(anomaly);

                // Auto-create alert for critical anomalies
                await Alert.create({
                    message: `Critical anomaly detected in ${cluster._id}: ${cluster.count} high-risk reports`,
                    region: cluster._id,
                    severity: "Critical",
                    status: "active",
                    createdBy: req.user._id
                });
            }
        }

        res.json({
            message: `Detection complete. Found ${detectedAnomalies.length} new anomalies.`,
            anomalies: detectedAnomalies,
            detected: detectedAnomalies.length
        });

    } catch (error) {
        res.status(500).json({ message: "Detection failed", error: error.message });
    }
});

module.exports = { 
    getAnomalies, 
    getStats,
    createAnomaly, 
    reviewAnomaly, 
    deleteAnomaly,
    runDetection
};
