const mongoose = require("mongoose");

const isAtlas = (uri = "") =>
    uri.startsWith("mongodb+srv://") || uri.includes("mongodb.net");

const connectDB = async () => {
    const uri = process.env.MONGO_URI;
    const opts = isAtlas(uri)
        ? {
            serverApi: { version: "1", strict: true, deprecationErrors: true },
            tls: true,
            tlsInsecure: false,   // verify Atlas CA
            autoIndex: false,
        }
        : { autoIndex: true };     // local dev – no TLS needed

    try {
        const conn = await mongoose.connect(uri, opts);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = { connectDB };
