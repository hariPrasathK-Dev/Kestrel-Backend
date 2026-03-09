const mongoose = require("mongoose");

const documentContextSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileType: {
      type: String,
      enum: ["pdf", "txt", "csv", "doc"],
      required: true,
    },
    chunks: [
      {
        text: { type: String, required: true },
        chunkIndex: { type: Number, required: true },
        startWordIndex: { type: Number },
        endWordIndex: { type: Number },
        embedding: { type: [Number], default: [] }, // Vector embedding for semantic search
      },
    ],
    totalChunks: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("DocumentContext", documentContextSchema);
