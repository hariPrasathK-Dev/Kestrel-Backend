const Region = require("../models/Region");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/regions
const getAllRegions = asyncHandler(async (req, res) => {
    const { ecosystemType, protectionStatus, search, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (ecosystemType) filter.ecosystemType = ecosystemType;
    if (protectionStatus) filter.protectionStatus = protectionStatus;
    if (search) filter.name = { $regex: search, $options: "i" };

    const total = await Region.countDocuments(filter);
    const regions = await Region.find(filter)
        .populate("createdBy", "name")
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

    res.json({ regions, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET /api/regions/:id
const getRegionById = asyncHandler(async (req, res) => {
    const region = await Region.findById(req.params.id).populate("createdBy", "name");
    if (!region) return res.status(404).json({ message: "Region not found" });
    res.json(region);
});

// POST /api/regions (officer, admin)
const createRegion = asyncHandler(async (req, res) => {
    const data = { ...req.body, createdBy: req.user._id };
    const region = await Region.create(data);
    res.status(201).json(region);
});

// PUT /api/regions/:id (officer, admin)
const updateRegion = asyncHandler(async (req, res) => {
    const region = await Region.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    });
    if (!region) return res.status(404).json({ message: "Region not found" });
    res.json(region);
});

// DELETE /api/regions/:id (admin)
const deleteRegion = asyncHandler(async (req, res) => {
    const region = await Region.findByIdAndDelete(req.params.id);
    if (!region) return res.status(404).json({ message: "Region not found" });
    res.json({ message: "Region deleted" });
});

module.exports = { getAllRegions, getRegionById, createRegion, updateRegion, deleteRegion };
