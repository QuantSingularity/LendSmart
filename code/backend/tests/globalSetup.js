const { createServer } = require("./fakeMongoServer");

let fakeServer = null;

module.exports = async () => {
  // Configure test environment
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-only-min32chars";
  process.env.JWT_EXPIRE = "1h";
  process.env.REFRESH_TOKEN_SECRET =
    "test-refresh-secret-key-for-testing-min32";
  process.env.REFRESH_TOKEN_EXPIRE = "7d";
  process.env.ENCRYPTION_KEY = "test-encryption-key-32-characters!!";
  process.env.ENCRYPTION_MASTER_KEY =
    "test-encryption-master-key-64-characters-padding-here-XXXXXXXXXX";
  process.env.LOG_LEVEL = "error";
  process.env.SKIP_REDIS = "true";
  process.env.SKIP_DB_CONNECTION = "true";

  // Start in-memory fake MongoDB server
  const port = 27117;
  fakeServer = await createServer(port);

  const mongoUri = `mongodb://127.0.0.1:${port}/lendsmart_test`;
  process.env.MONGODB_URI = mongoUri;
  process.env.MONGODB_TEST_URI = mongoUri;

  global.__FAKE_MONGO_SERVER__ = fakeServer;
  console.log(`✅ Fake MongoDB server started on port ${port}`);
};
