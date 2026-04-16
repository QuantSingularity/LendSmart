module.exports = {
  preset: "react-native",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|react-native-paper|@react-navigation|react-native-vector-icons|react-native-svg|@react-native-async-storage|@react-native-community|@walletconnect)/)",
  ],
  testPathIgnorePatterns: ["/node_modules/", "/android/", "/ios/"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx,js,jsx}",
    "!src/**/*.test.{ts,tsx,js,jsx}",
    "!src/**/__tests__/**",
    "!src/types/**",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};
