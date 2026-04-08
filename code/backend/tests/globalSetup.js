const { MongoMemoryServer } = require("mongodb-memory-server");

module.exports = async () => {
  const mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri;
  process.env.MONGODB_TEST_URI = mongoUri;
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-only-min32chars";
  process.env.JWT_EXPIRE = "1h";
  process.env.REFRESH_TOKEN_SECRET =
    "test-refresh-secret-key-for-testing-min32";
  process.env.REFRESH_TOKEN_EXPIRE = "7d";
  process.env.ENCRYPTION_KEY = "test-encryption-key-32-characters!!";
  process.env.ENCRYPTION_MASTER_KEY =
    "test-encryption-master-key-64-characters-padding-here-XXXXXXXXXX";
  process.env.SKIP_DB_CONNECTION = "false";
  process.env.LOG_LEVEL = "error";
  process.env.SKIP_REDIS = "true";
  global.__MONGO_SERVER__ = mongoServer;
};
