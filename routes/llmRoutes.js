const express = require("express");
const router = express.Router();
const {
    saveConfig,
    getConfig,
    uploadDocument,
    getDocuments,
    deleteDocument,
    askQuestion,
    getConversations,
    getConversation,
    deleteConversation,
} = require("../controllers/llmController");
const { protect } = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload");

// All routes require authentication
router.use(protect);

// Configuration
router.post("/config", saveConfig);
router.get("/config", getConfig);

// Document management
router.post("/upload-document", upload.single("file"), uploadDocument);
router.get("/documents", getDocuments);
router.delete("/documents/:id", deleteDocument);

// Chat/Query
router.post("/ask", askQuestion);

// Conversations
router.get("/conversations", getConversations);
router.get("/conversations/:id", getConversation);
router.delete("/conversations/:id", deleteConversation);

module.exports = router;
