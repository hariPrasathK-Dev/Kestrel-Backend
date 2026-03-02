const express = require("express");
const router = express.Router();
const {
    uploadDocument, getDocuments, getDocumentById,
    updateDocumentStatus, deleteDocument,
} = require("../controllers/documentController");
const { protect } = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleGuard");
const upload = require("../middlewares/upload");

// All routes require auth
router.use(protect);

// Upload (officer + admin only)
router.post("/", requireRole("officer", "admin"), upload.single("file"), uploadDocument);

// Get list (role-filtered in controller)
router.get("/", getDocuments);

// Get single
router.get("/:id", getDocumentById);

// Approve / reject (admin only)
router.patch("/:id/status", requireRole("admin"), updateDocumentStatus);

// Delete
router.delete("/:id", deleteDocument);

module.exports = router;
