const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads dir exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

// Filter for document files (text-based)
const fileFilter = (req, file, cb) => {
  const allowed = /pdf|txt|csv|doc|docx|md|json/;
  const extname = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimetype =
    allowed.test(file.mimetype) ||
    file.mimetype === "text/plain" ||
    file.mimetype === "text/csv" ||
    file.mimetype === "application/pdf" ||
    file.mimetype === "application/msword" ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only document files are allowed (PDF, TXT, CSV, DOC, DOCX, MD, JSON)",
      ),
      false,
    );
  }
};

const documentUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for documents
});

module.exports = documentUpload;
