const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
    {
        title: { type: String, required: [true, "Title is required"], trim: true },
        description: { type: String, default: "", maxlength: 1000 },
        fileUrl: { type: String, required: true },
        fileName: { type: String, required: true },
        fileType: {
            type: String,
            enum: ["pdf", "csv", "image", "doc", "other"],
            default: "other",
        },
        mimeType: { type: String, default: "" },
        fileSize: { type: Number, default: 0 },
        uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
        adminNote: { type: String, default: "" },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        approvedAt: { type: Date, default: null },
        tags: [{ type: String, trim: true }],
    },
    { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);
