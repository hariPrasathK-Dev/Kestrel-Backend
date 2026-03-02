const Document = require("../models/Document");
const asyncHandler = require("../utils/asyncHandler");
const path = require("path");

// Helper: detect file type from mime
const detectFileType = (mimetype, originalname) => {
    if (mimetype === "text/csv" || originalname.endsWith(".csv")) return "csv";
    if (mimetype === "application/pdf") return "pdf";
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.includes("word") || mimetype.includes("document")) return "doc";
    return "other";
};

// POST /api/documents  (officer & admin)
const uploadDocument = asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "File is required" });
    const { title, description, tags } = req.body;
    if (!title) return res.status(400).json({ message: "Title is required" });

    const fileType = detectFileType(req.file.mimetype, req.file.originalname);

    const doc = await Document.create({
        title,
        description: description || "",
        fileUrl: `/uploads/${req.file.filename}`,
        fileName: req.file.originalname,
        fileType,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        uploadedBy: req.user._id,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    });

    const populated = await doc.populate("uploadedBy", "name email role");
    res.status(201).json(populated);
});

// GET /api/documents
// - admin: all documents
// - officer: own uploads (all statuses)
// - user: approved only
const getDocuments = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (req.user.role === "admin") {
        if (status) filter.status = status;
    } else if (req.user.role === "officer") {
        filter.uploadedBy = req.user._id;
        if (status) filter.status = status;
    } else {
        // user — only approved
        filter.status = "approved";
    }

    const total = await Document.countDocuments(filter);
    const docs = await Document.find(filter)
        .populate("uploadedBy", "name email role")
        .populate("approvedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

    res.json({ documents: docs, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// GET /api/documents/:id
const getDocumentById = asyncHandler(async (req, res) => {
    const doc = await Document.findById(req.params.id)
        .populate("uploadedBy", "name email role")
        .populate("approvedBy", "name");

    if (!doc) return res.status(404).json({ message: "Document not found" });

    // Non-admin/officer users can only see approved docs
    if (req.user.role === "user" && doc.status !== "approved") {
        return res.status(403).json({ message: "Access denied" });
    }
    // Officers can only see their own or approved
    if (req.user.role === "officer" && doc.uploadedBy._id.toString() !== req.user._id.toString() && doc.status !== "approved") {
        return res.status(403).json({ message: "Access denied" });
    }

    res.json(doc);
});

// PATCH /api/documents/:id/status  (admin only)
const updateDocumentStatus = asyncHandler(async (req, res) => {
    const { status, adminNote } = req.body;
    if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    const update = {
        status,
        adminNote: adminNote || "",
    };
    if (status === "approved") {
        update.approvedBy = req.user._id;
        update.approvedAt = new Date();
    }

    const doc = await Document.findByIdAndUpdate(req.params.id, update, { new: true })
        .populate("uploadedBy", "name email")
        .populate("approvedBy", "name");

    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json(doc);
});

// DELETE /api/documents/:id (officer own + admin)
const deleteDocument = asyncHandler(async (req, res) => {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    if (req.user.role !== "admin" && doc.uploadedBy.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Access denied" });
    }
    await doc.deleteOne();
    res.json({ message: "Document deleted" });
});

module.exports = { uploadDocument, getDocuments, getDocumentById, updateDocumentStatus, deleteDocument };
