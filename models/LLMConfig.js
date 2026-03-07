const mongoose = require("mongoose");
const crypto = require("crypto");

const llmConfigSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        provider: {
            type: String,
            enum: ["groq"],
            default: "groq",
        },
        model: {
            type: String,
            enum: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b"],
            default: "llama-3.1-8b-instant",
        },
        encryptedApiKey: { type: String, required: true },
        isActive: { type: Boolean, default: true },
        lastValidated: { type: Date, default: null },
    },
    { timestamps: true }
);

// Encryption key from environment
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "kestrel-secret-key-32-characters";
const ALGORITHM = "aes-256-cbc";

// Helper to encrypt API key
llmConfigSchema.methods.setApiKey = function (apiKey) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(apiKey, "utf8", "hex");
    encrypted += cipher.final("hex");
    this.encryptedApiKey = iv.toString("hex") + ":" + encrypted;
};

// Helper to decrypt API key
llmConfigSchema.methods.getApiKey = function () {
    const parts = this.encryptedApiKey.split(":");
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32));
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
};

module.exports = mongoose.model("LLMConfig", llmConfigSchema);
