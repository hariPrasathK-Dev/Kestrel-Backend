const LLMConfig = require("../models/LLMConfig");
const DocumentContext = require("../models/DocumentContext");
const Conversation = require("../models/Conversation");
const asyncHandler = require("../utils/asyncHandler");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;

// Groq API integration
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Helper function: Simple TF-IDF based embedding generation
const generateEmbedding = (text, vocabulary = null) => {
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const wordFreq = {};

  words.forEach((word) => {
    wordFreq[word] = (wordFreq[word] || 0) + 1;
  });

  // If vocabulary is provided (for query), use it; otherwise create from text
  const vocab = vocabulary || Object.keys(wordFreq);
  const embedding = vocab.map((word) => wordFreq[word] || 0);

  // Normalize the vector
  const magnitude = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0),
  );
  return embedding.map((val) => (magnitude > 0 ? val / magnitude : 0));
};

// Helper function: Calculate cosine similarity between two vectors
const cosineSimilarity = (vec1, vec2) => {
  const minLength = Math.min(vec1.length, vec2.length);
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;

  for (let i = 0; i < minLength; i++) {
    dotProduct += vec1[i] * vec2[i];
    mag1 += vec1[i] * vec1[i];
    mag2 += vec2[i] * vec2[i];
  }

  mag1 = Math.sqrt(mag1);
  mag2 = Math.sqrt(mag2);

  if (mag1 === 0 || mag2 === 0) return 0;
  return dotProduct / (mag1 * mag2);
};

// Model configurations - Official Groq Production Models (as of March 2026)
const GROQ_MODELS = {
  "llama-3.1-8b-instant": {
    name: "LLaMA 3.1 8B (560 T/s)",
    context: 131072,
    speed: "560",
  },
  "llama-3.3-70b-versatile": {
    name: "LLaMA 3.3 70B (280 T/s)",
    context: 131072,
    speed: "280",
  },
  "openai/gpt-oss-120b": {
    name: "OpenAI GPT-OSS 120B (500 T/s)",
    context: 131072,
    speed: "500",
  },
  "openai/gpt-oss-20b": {
    name: "OpenAI GPT-OSS 20B (1000 T/s)",
    context: 131072,
    speed: "1000",
  },
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
        Authorization: `Bearer ${apiKey}`,
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
      const errorMessage =
        errorData.error?.message ||
        errorData.message ||
        "Invalid API key or model";
      console.error("Groq API validation error:", errorMessage);
      return res.status(401).json({ message: errorMessage });
    }

    // Verify response is valid
    const responseData = await testResponse.json();
    if (!responseData.choices || !responseData.choices[0]) {
      return res
        .status(500)
        .json({ message: "Invalid response from Groq API" });
    }
  } catch (error) {
    console.error("Groq API validation exception:", error);
    return res
      .status(500)
      .json({ message: error.message || "Failed to connect to Groq API" });
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
  const fileType = mimetype.includes("pdf")
    ? "pdf"
    : mimetype.includes("csv")
      ? "csv"
      : "txt";

  // Read file content
  let content = "";
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch (error) {
    return res.status(500).json({ message: "Failed to read file" });
  }

  // Chunk the content with overlapping windows for better context preservation
  const words = content.split(/\s+/);
  const chunkSize = 500;
  const overlapSize = 100; // 100-word overlap between chunks
  const chunks = [];

  // Build global vocabulary from entire document for consistent embeddings
  const globalVocab = [
    ...new Set(content.toLowerCase().match(/\b\w+\b/g) || []),
  ];

  for (let i = 0; i < words.length; i += chunkSize - overlapSize) {
    const chunkWords = words.slice(i, i + chunkSize);
    const chunkText = chunkWords.join(" ");

    // Only add non-empty chunks
    if (chunkText.trim().length > 0) {
      // Generate embedding for this chunk
      const embedding = generateEmbedding(chunkText, globalVocab);

      chunks.push({
        text: chunkText,
        chunkIndex: chunks.length,
        startWordIndex: i,
        endWordIndex: i + chunkWords.length,
        embedding: embedding,
      });
    }

    // Break if we've processed all words
    if (i + chunkSize >= words.length) break;
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
    return res.status(400).json({
      message: "LLM not configured. Please set up your API key first.",
    });
  }

  const apiKey = config.getApiKey();

  // Get conversation or create new one
  let conversation;
  if (conversationId) {
    conversation = await Conversation.findOne({
      _id: conversationId,
      userId: req.user._id,
    });
  }

  if (!conversation) {
    conversation = await Conversation.create({
      userId: req.user._id,
      documentId: documentId || null,
      messages: [],
      title: question.slice(0, 50),
    });
  }

  // Get user profile for personalized context
  const User = require("../models/User");
  const userProfile = await User.findById(req.user._id).select(
    "name role organization bio",
  );

  // Build context from document if provided
  let contextText = "";
  if (documentId) {
    const document = await DocumentContext.findOne({
      _id: documentId,
      userId: req.user._id,
    });

    if (document && document.status === "ready") {
      // Use semantic vector search with cosine similarity
      // Build vocabulary from all chunks for consistent embedding
      const allText = document.chunks.map((c) => c.text).join(" ");
      const globalVocab = [
        ...new Set(allText.toLowerCase().match(/\b\w+\b/g) || []),
      ];

      // Generate embedding for the user's question
      const questionEmbedding = generateEmbedding(question, globalVocab);

      // Calculate similarity scores for all chunks
      const chunksWithScores = document.chunks.map((chunk) => {
        const chunkEmbedding =
          chunk.embedding && chunk.embedding.length > 0
            ? chunk.embedding
            : generateEmbedding(chunk.text, globalVocab); // Fallback for old chunks without embeddings

        const similarity = cosineSimilarity(questionEmbedding, chunkEmbedding);

        return {
          text: chunk.text,
          similarity: similarity,
          chunkIndex: chunk.chunkIndex,
        };
      });

      // Sort by similarity and take top 3 most relevant chunks
      const relevantChunks = chunksWithScores
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3)
        .filter((chunk) => chunk.similarity > 0.1); // Only include chunks with meaningful similarity

      contextText = relevantChunks.map((c) => c.text).join("\n\n");

      // Log similarity scores for debugging
      console.log(
        "Top chunk similarities:",
        relevantChunks.map((c) => ({
          index: c.chunkIndex,
          similarity: c.similarity.toFixed(3),
        })),
      );
    }
  }

  // Build personalized system prompt based on user profile
  const roleExpertise = {
    admin:
      "an administrator with full system access and oversight responsibilities",
    officer:
      "a conservation officer with field expertise and research coordination duties",
    user: "a researcher or citizen scientist contributing to biodiversity monitoring",
  };

  const expertiseLevel =
    userProfile.role === "admin" || userProfile.role === "officer"
      ? "advanced technical knowledge"
      : "varying levels of expertise";

  let systemPrompt = `You are an expert biodiversity AI assistant talking to ${userProfile.name}, ${roleExpertise[userProfile.role] || "a biodiversity enthusiast"}.`;

  if (userProfile.organization) {
    systemPrompt += ` They work with ${userProfile.organization}.`;
  }

  if (userProfile.bio) {
    systemPrompt += ` User background: ${userProfile.bio}.`;
  }

  systemPrompt += ` Tailor your explanations to their ${expertiseLevel} and organizational context. Be precise with scientific terminology when appropriate, but ensure clarity.`;

  if (contextText) {
    systemPrompt += `\n\nUse the following document context to answer their questions:\n\n${contextText}`;
  }

  // Build messages for Groq API
  const messages = [
    {
      role: "system",
      content: systemPrompt,
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
        Authorization: `Bearer ${apiKey}`,
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
      { role: "assistant", content: assistantMessage, tokensUsed },
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
    return res
      .status(500)
      .json({ message: error.message || "Failed to get response from LLM" });
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
