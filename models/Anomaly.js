const mongoose = require("mongoose");

const anomalySchema = new mongoose.Schema(
    {
        region: { type: String, required: true, trim: true },
        type: {
            type: String,
            enum: ["Population Decline", "Invasive Species", "Habitat Loss", "Disease Outbreak", "Unusual Migration", "Other"],
            required: true,
        },
        severity: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
        description: { type: String, default: "" },
        detectedAt: { type: Date, default: Date.now },
        detectionMethod: { type: String, enum: ["manual", "automated"], default: "manual" },
        status: { type: String, enum: ["open", "under_review", "resolved"], default: "open" },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reviewNotes: { type: String, default: "" },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Anomaly", anomalySchema);
