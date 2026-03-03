const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");
const { connectDB } = require("./config/db");
const { notFound, errorHandler } = require("./middlewares/errorHandler");
const { globalLimiter } = require("./middlewares/rateLimiter");

// Load env
dotenv.config();

// Connect DB
connectDB();

const app = express();

// ─── Core Middleware ─────────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));
app.use(globalLimiter);

// ─── Static Files ────────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/species", require("./routes/speciesRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use("/api/analytics", require("./routes/analyticsRoutes"));
app.use("/api/alerts", require("./routes/alertRoutes"));
app.use("/api/anomalies", require("./routes/anomalyRoutes"));
app.use("/api/forum", require("./routes/forumRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/documents", require("./routes/documentRoutes"));
app.use("/api/regions", require("./routes/regionRoutes"));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || "development",
}));

// ─── Error Handling ───────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🦅 KESTREL API running on http://localhost:${PORT}`);
});