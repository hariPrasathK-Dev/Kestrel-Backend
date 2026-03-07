const LLMConfig = require("../models/LLMConfig");
const DocumentContext = require("../models/DocumentContext");
const Conversation = require("../models/Conversation");
const asyncHandler = require("../utils/asyncHandler");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;

// Groq API integration
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Model configurations - Official Groq Production Models (as of March 2026)
const GROQ_MODELS = {
    "llama-3.1-8b-instant": { name: "LLaMA 3.1 8B (560 T/s)", context: 131072, speed: "560" },
    "llama-3.3-70b-versatile": { name: "LLaMA 3.3 70B (280 T/s)", context: 131072, speed: "280" },
    "openai/gpt-oss-120b": { name: "OpenAI GPT-OSS 120B (500 T/s)", context: 131072, speed: "500" },
    "openai/gpt-oss-20b": { name: "OpenAI GPT-OSS 20B (1000 T/s)", context: 131072, speed: "1000" },
};

// POST /api/llm/config - Save/Update API key and model
const saveConfig = asyncHandler(async (req, res) => {
    const { apiKey, model } = req.body;

    if (!apiKey || !model) {
        return res.status(400).json({ message: "API key and model are required" });
    }

    if (!GROQ_MODELS[model]) {
        return res.status(400).json({ message: "Invalid model selected" });
    }

    // Test the API key with Groq
    try {
        const testResponse = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: "test" }],
                max_tokens: 5,
            }),
        });

        if (!testResponse.ok) {
            const errorData = await testResponse.json().catch(() => ({}));
            const errorMessage = errorData.error?.message || errorData.message || "Invalid API key or model";
            console.error("Groq API validation error:", errorMessage);
            return res.status(401).json({ message: errorMessage });
        }

        // Verify response is valid
        const responseData = await testResponse.json();
        if (!responseData.choices || !responseData.choices[0]) {
            return res.status(500).json({ message: "Invalid response from Groq API" });
        }
    } catch (error) {
        console.error("Groq API validation exception:", error);
        return res.status(500).json({ message: error.message || "Failed to connect to Groq API" });
    }

    // Save or update config
    let config = await LLMConfig.findOne({ userId: req.user._id });

    if (config) {
        config.model = model;
        config.setApiKey(apiKey);
        config.lastValidated = new Date();
        config.isActive = true;
    } else {
        config = new LLMConfig({
            userId: req.user._id,
            model,
            provider: "groq",
        });
        config.setApiKey(apiKey);
        config.lastValidated = new Date();
    }

    await config.save();

    res.json({
        message: "Configuration saved successfully",
        model: config.model,
        provider: config.provider,
        lastValidated: config.lastValidated,
    });
});

// GET /api/llm/config - Get current config
const getConfig = asyncHandler(async (req, res) => {
    const config = await LLMConfig.findOne({ userId: req.user._id });

    if (!config) {
        return res.json({ configured: false });
    }

    res.json({
        configured: true,
        model: config.model,
        provider: config.provider,
        lastValidated: config.lastValidated,
        availableModels: Object.keys(GROQ_MODELS).map((key) => ({
            id: key,
            name: GROQ_MODELS[key].name,
            context: GROQ_MODELS[key].context,
        })),
    });
});

// POST /api/llm/upload-document - Upload and process document
const uploadDocument = asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    const { originalname, path: filePath, mimetype } = req.file;
    const fileType = mimetype.includes("pdf") ? "pdf" : mimetype.includes("csv") ? "csv" : "txt";

    // Read file content
    let content = "";
    try {
        content = await fs.readFile(filePath, "utf-8");
    } catch (error) {
        return res.status(500).json({ message: "Failed to read file" });
    }

    // Chunk the content (500 words per chunk)
    const words = content.split(/\s+/);
    const chunkSize = 500;
    const chunks = [];

    for (let i = 0; i < words.length; i += chunkSize) {
        const chunkText = words.slice(i, i + chunkSize).join(" ");
        chunks.push({
            text: chunkText,
            chunkIndex: Math.floor(i / chunkSize),
        });
    }

    // Save to database
    const document = await DocumentContext.create({
        userId: req.user._id,
        fileName: originalname,
        fileUrl: `/uploads/${path.basename(filePath)}`,
        fileType,
        chunks,
        totalChunks: chunks.length,
        status: "ready",
    });

    res.json({
        message: "Document processed successfully",
        document: {
            _id: document._id,
            fileName: document.fileName,
            totalChunks: document.totalChunks,
            status: document.status,
        },
    });
});

// GET /api/llm/documents - List user's documents
const getDocuments = asyncHandler(async (req, res) => {
    const documents = await DocumentContext.find({ userId: req.user._id })
        .select("-chunks")
        .sort({ createdAt: -1 });

    res.json({ documents });
});

// DELETE /api/llm/documents/:id - Delete document
const deleteDocument = asyncHandler(async (req, res) => {
    const document = await DocumentContext.findOne({
        _id: req.params.id,
        userId: req.user._id,
    });

    if (!document) {
        return res.status(404).json({ message: "Document not found" });
    }

    // Delete file from uploads folder
    try {
        await fs.unlink(path.join(__dirname, "..", document.fileUrl));
    } catch {
        // Ignore if file doesn't exist
    }

    await document.deleteOne();

    res.json({ message: "Document deleted" });
});

// POST /api/llm/ask - Ask question with RAG
const askQuestion = asyncHandler(async (req, res) => {
    const { question, documentId, conversationId } = req.body;

    if (!question) {
        return res.status(400).json({ message: "Question is required" });
    }

    // Get user's LLM config
    const config = await LLMConfig.findOne({ userId: req.user._id });
    if (!config) {
        return res.status(400).json({ message: "LLM not configured. Please set up your API key first." });
    }

    const apiKey = config.getApiKey();

    // Get conversation or create new one
    let conversation;
    if (conversationId) {
        conversation = await Conversation.findOne({ _id: conversationId, userId: req.user._id });
    }

    if (!conversation) {
        conversation = await Conversation.create({
            userId: req.user._id,
            documentId: documentId || null,
            messages: [],
            title: question.slice(0, 50),
        });
    }

    // Build context from document if provided
    let contextText = "";
    if (documentId) {
        const document = await DocumentContext.findOne({
            _id: documentId,
            userId: req.user._id,
        });

        if (document && document.status === "ready") {
            // Simple keyword search in chunks (better than nothing without embeddings)
            const keywords = question.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
            const relevantChunks = document.chunks
                .filter((chunk) => {
                    const chunkLower = chunk.text.toLowerCase();
                    return keywords.some((kw) => chunkLower.includes(kw));
                })
                .slice(0, 3); // Top 3 chunks

            contextText = relevantChunks.map((c) => c.text).join("\n\n");
        }
    }

    // Build messages for Groq API
    const messages = [
        {
            role: "system",
            content: contextText
                ? `You are a helpful assistant analyzing biodiversity research documents. Use the following context to answer questions:\n\n${contextText}`
                : "You are a helpful assistant for biodiversity researchers.",
        },
        ...conversation.messages.slice(-5).map((m) => ({
            role: m.role,
            content: m.content,
        })),
        { role: "user", content: question },
    ];

    // Call Groq API
    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                max_tokens: 1024,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || "Groq API error");
        }

        const data = await response.json();
        const assistantMessage = data.choices[0].message.content;
        const tokensUsed = data.usage?.total_tokens || 0;

        // Save messages to conversation
        conversation.messages.push(
            { role: "user", content: question, tokensUsed: 0 },
            { role: "assistant", content: assistantMessage, tokensUsed }
        );
        conversation.totalTokens += tokensUsed;
        await conversation.save();

        res.json({
            answer: assistantMessage,
            conversationId: conversation._id,
            tokensUsed,
            contextUsed: !!contextText,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to get response from LLM" });
    }
});

// GET /api/llm/conversations - Get user's conversations
const getConversations = asyncHandler(async (req, res) => {
    const conversations = await Conversation.find({ userId: req.user._id })
        .populate("documentId", "fileName")
        .select("-messages")
        .sort({ updatedAt: -1 })
        .limit(20);

    res.json({ conversations });
});

// GET /api/llm/conversations/:id - Get conversation with messages
const getConversation = asyncHandler(async (req, res) => {
    const conversation = await Conversation.findOne({
        _id: req.params.id,
        userId: req.user._id,
    }).populate("documentId", "fileName");

    if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
    }

    res.json({ conversation });
});

// DELETE /api/llm/conversations/:id - Delete conversation
const deleteConversation = asyncHandler(async (req, res) => {
    const conversation = await Conversation.findOne({
        _id: req.params.id,
        userId: req.user._id,
    });

    if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
    }

    await conversation.deleteOne();
    res.json({ message: "Conversation deleted" });
});

module.exports = {
    saveConfig,
    getConfig,
    uploadDocument,
    getDocuments,
    deleteDocument,
    askQuestion,
    getConversations,
    getConversation,
    deleteConversation,
};
