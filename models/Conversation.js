const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocumentContext",
      default: null,
    },
    messages: [
      {
        role: { type: String, enum: ["user", "assistant"], required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        tokensUsed: { type: Number, default: 0 },
      },
    ],
    totalTokens: { type: Number, default: 0 },
    title: { type: String, default: "New Conversation" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Conversation", conversationSchema);
