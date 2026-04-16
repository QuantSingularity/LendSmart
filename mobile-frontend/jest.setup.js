// Jest setup file
// import 'react-native-gesture-handler/jestSetup';

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// Mock react-native-keychain
jest.mock("react-native-keychain", () => ({
  setGenericPassword: jest.fn(() => Promise.resolve()),
  getGenericPassword: jest.fn(() => Promise.resolve(null)),
  resetGenericPassword: jest.fn(() => Promise.resolve()),
}));

// Mock NetInfo
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
}));

// Mock react-native-vector-icons
jest.mock("react-native-vector-icons/MaterialCommunityIcons", () => "Icon");

// Silence the warning: Animated: `useNativeDriver` is not supported
// jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock WalletConnect
jest.mock("@walletconnect/modal-react-native", () => ({
  WalletConnectModal: jest.fn(() => null),
}));

jest.mock("@walletconnect/react-native-compat", () => ({}));
jest.mock("react-native-get-random-values", () => ({}));

// Global test timeout
jest.setTimeout(10000);
