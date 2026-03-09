const { Pinecone } = require("@pinecone-database/pinecone");

let pineconeClient = null;
let pineconeIndex = null;

/**
 * Initialize Pinecone client and connect to index
 * @returns {Promise<Object>} Returns the Pinecone index instance
 */
const initPinecone = async () => {
  try {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error(
        "PINECONE_API_KEY is not defined in environment variables",
      );
    }

    if (!process.env.PINECONE_INDEX_NAME) {
      throw new Error(
        "PINECONE_INDEX_NAME is not defined in environment variables",
      );
    }

    // Initialize Pinecone client
    pineconeClient = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });

    // Connect to the specified index
    pineconeIndex = pineconeClient.index(process.env.PINECONE_INDEX_NAME);

    // Get index stats to verify connection and dimensions
    try {
      const stats = await pineconeIndex.describeIndexStats();
      console.log(
        `✅ Pinecone Connected: Index "${process.env.PINECONE_INDEX_NAME}"`,
      );
      console.log(`   Dimension: ${stats.dimension || 'checking...'}, Total vectors: ${stats.totalRecordCount || 0}`);
    } catch (statsError) {
      // Fallback if stats are not available
      console.log(
        `✅ Pinecone Connected: Index "${process.env.PINECONE_INDEX_NAME}"`,
      );
    }

    return pineconeIndex;
  } catch (error) {
    console.error(`❌ Pinecone initialization error: ${error.message}`);
    throw error;
  }
};

/**
 * Get Pinecone client instance
 * @returns {Pinecone} Pinecone client
 */
const getPineconeClient = () => {
  if (!pineconeClient) {
    throw new Error(
      "Pinecone client not initialized. Call initPinecone() first.",
    );
  }
  return pineconeClient;
};

/**
 * Get Pinecone index instance
 * @returns {Object} Pinecone index
 */
const getPineconeIndex = () => {
  if (!pineconeIndex) {
    throw new Error(
      "Pinecone index not initialized. Call initPinecone() first.",
    );
  }
  return pineconeIndex;
};

module.exports = {
  initPinecone,
  getPineconeClient,
  getPineconeIndex,
};
