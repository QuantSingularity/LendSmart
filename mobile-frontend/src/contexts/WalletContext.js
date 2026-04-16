import { useWalletConnectModal } from "@walletconnect/modal-react-native";
import { ethers } from "ethers"; // For provider wrapping
import PropTypes from "prop-types";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Alert } from "react-native";

export const WalletContext = createContext({
  isConnected: false,
  address: null,
  provider: null, // This might be the WalletConnect provider instance
  ethersProvider: null, // Ethers.js wrapped provider
  connectWallet: () => {},
  disconnectWallet: () => {},
});

export const WalletProvider = ({ children }) => {
  const { open, isConnected, address, provider } = useWalletConnectModal();
  const [ethersProvider, setEthersProvider] = useState(null);

  // Wrap the WalletConnect provider with ethers.js when connected
  React.useEffect(() => {
    if (isConnected && provider) {
      // Wrap the WalletConnect provider with ethers.js BrowserProvider
      const web3Provider = new ethers.BrowserProvider(provider);
      setEthersProvider(web3Provider);
      console.log("Ethers provider set up for address:", address);
    } else {
      setEthersProvider(null);
    }
  }, [isConnected, provider, address]);

  const connectWallet = useCallback(async () => {
    try {
      if (!isConnected) {
        await open(); // Opens the WalletConnect modal
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      Alert.alert(
        "Connection Error",
        "Could not connect wallet. Please try again.",
      );
    }
  }, [isConnected, open]);

  const disconnectWallet = useCallback(async () => {
    try {
      if (isConnected && provider) {
        await provider.disconnect();
        setEthersProvider(null); // Clear ethers provider on disconnect
      }
    } catch (error) {
      console.error("Failed to disconnect wallet:", error);
      Alert.alert("Disconnection Error", "Could not disconnect wallet.");
    }
  }, [isConnected, provider]);

  const walletContextValue = useMemo(
    () => ({
      isConnected,
      address,
      provider, // Raw WalletConnect provider
      ethersProvider, // Ethers.js provider
      connectWallet,
      disconnectWallet,
    }),
    [
      isConnected,
      address,
      provider,
      ethersProvider,
      connectWallet,
      disconnectWallet,
    ],
  );

  return (
    <WalletContext.Provider value={walletContextValue}>
      {children}
    </WalletContext.Provider>
  );
};

WalletProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

// Custom hook for easy context usage
export const useWallet = () => useContext(WalletContext);
