const mongoose = require("mongoose");

const regionSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, unique: true },
        state: { type: String, required: true, trim: true },
        district: { type: String, trim: true, default: "" },
        area: { type: Number, default: 0 }, // in sq km
        ecosystemType: {
            type: String,
            enum: ["Forest", "Wetland", "Grassland", "Coastal", "Desert", "Alpine", "Freshwater", "Other"],
            default: "Other",
        },
        protectionStatus: {
            type: String,
            enum: ["Protected", "Unprotected", "Partial"],
            default: "Unprotected",
        },
        description: { type: String, default: "", maxlength: 1000 },
        coordinates: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
        },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

regionSchema.index({ coordinates: "2dsphere" });

module.exports = mongoose.model("Region", regionSchema);
