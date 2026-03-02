const User = require("../models/User");
const SpeciesReport = require("../models/SpeciesReport");
const asyncHandler = require("../utils/asyncHandler");

// GET /api/admin/users
const getUsers = asyncHandler(async (req, res) => {
    const { role, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (role) filter.role = role;
    const total = await User.countDocuments(filter);
    const users = await User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(Number(limit));
    res.json({ users, total });
});

// PATCH /api/admin/users/:id/role
const updateUserRole = asyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!["user", "officer", "admin"].includes(role)) return res.status(400).json({ message: "Invalid role" });
    const user = await User.findByIdAndUpdate(
        req.params.id,
        { role, roleUpgradeRequest: false },
        { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
});

// GET /api/admin/role-requests
const getRoleRequests = asyncHandler(async (req, res) => {
    const users = await User.find({ roleUpgradeRequest: true }).sort({ createdAt: -1 });
    res.json(users);
});

// PATCH /api/admin/users/:id/deactivate
const toggleUserActive = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `User ${user.isActive ? "activated" : "deactivated"}`, user });
});

// GET /api/admin/activity
const getActivity = asyncHandler(async (req, res) => {
    const recentReports = await SpeciesReport.find()
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .limit(20);
    res.json({ recentReports });
});

module.exports = { getUsers, updateUserRole, getRoleRequests, toggleUserActive, getActivity };
