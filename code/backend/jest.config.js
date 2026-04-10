module.exports = {
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  globalSetup: "./tests/globalSetup.js",
  globalTeardown: "./tests/globalTeardown.js",
  setupFilesAfterEnv: ["./tests/jestSetup.js"],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: false,
  coverageDirectory: "coverage",
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/server.js",
    "!src/config/**",
    "!src/scripts/**",
  ],
};
