const { ethers } = require("ethers");
const { logger } = require("../../utils/logger");
const { AppError } = require("../../middleware/monitoring/errorHandler");
const blockchainConfig = require("../../config/blockchain");
const loanRegistryAbi = require("../../config/contracts/LoanRegistry.abi.json");

/**
 * Blockchain Service for LendSmart
 * Handles all blockchain interactions including smart contract deployment,
 * transaction management, and event listening with comprehensive error handling
 */
class BlockchainService {
  constructor() {
    this.providers = new Map();
    this.wallets = new Map();
    this.contracts = new Map();
    this.eventListeners = new Map();

    // Configuration
    this.networks = {
      ethereum: {
        name: "ethereum",
        chainId: 1,
        rpcUrl:
          process.env.ETHEREUM_RPC_URL ||
          "https://mainnet.infura.io/v3/YOUR_PROJECT_ID",
        explorerUrl: "https://etherscan.io",
      },
      polygon: {
        name: "polygon",
        chainId: 137,
        rpcUrl: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
        explorerUrl: "https://polygonscan.com",
      },
      sepolia: {
        name: "sepolia",
        chainId: 11155111,
        rpcUrl:
          process.env.SEPOLIA_RPC_URL ||
          "https://sepolia.infura.io/v3/YOUR_PROJECT_ID",
        explorerUrl: "https://sepolia.etherscan.io",
      },
      // Local Hardhat/Ganache node (`npx hardhat node` in code/blockchain),
      // useful for exercising this integration end-to-end without a public
      // testnet. Not intended for production use.
      localhost: {
        name: "localhost",
        chainId: 1337,
        rpcUrl: process.env.LOCALHOST_RPC_URL || "http://127.0.0.1:8545",
        explorerUrl: null,
      },
    };

    this.gasSettings = {
      maxFeePerGas: ethers.parseUnits("20", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
      gasLimit: 500000,
    };

    this.retryAttempts = 3;
    this.retryDelay = 2000; // 2 seconds

    // LoanRegistry: operator-written audit anchor for off-chain-originated
    // loans. See code/blockchain/contracts/LoanRegistry.sol.
    this.loanRegistryAbi = loanRegistryAbi;
    this.loanRegistryAddress = blockchainConfig.loanRegistryAddress;
    this.loanRegistryNetwork = blockchainConfig.loanRegistryNetwork;

    this.initialize();
  }

  /**
   * Initialize blockchain service
   */
  async initialize() {
    try {
      // Initialize providers for each network
      for (const [networkName, config] of Object.entries(this.networks)) {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        this.providers.set(networkName, provider);

        // Initialize wallet if private key is provided
        const privateKey =
          process.env[`${networkName.toUpperCase()}_PRIVATE_KEY`];
        if (privateKey) {
          const wallet = new ethers.Wallet(privateKey, provider);
          this.wallets.set(networkName, wallet);
        }
      }

      logger.info("Blockchain service initialized", {
        networks: Object.keys(this.networks),
        walletsConfigured: this.wallets.size,
      });
    } catch (error) {
      logger.error("Failed to initialize blockchain service", {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Record a newly-funded off-chain loan on the LoanRegistry contract.
   *
   * This does NOT deploy a new contract per loan - LendSmart is custodial
   * (KYC + a payment processor already moved the real funds before this is
   * called), and the backend's single operator wallet is the only signer
   * involved, so a shared audit-registry contract is what actually matches
   * how this platform works. See contracts/LoanRegistry.sol for the design
   * rationale.
   *
   * @param {Object} params
   * @param {string|import('mongoose').Types.ObjectId} params.loanId - The backend Loan document id.
   * @param {string} params.borrower - The borrower's wallet address.
   * @param {string} params.lender - The lender's wallet address.
   * @param {number|string} params.amount - Principal amount.
   * @param {number} params.interestRate - Interest rate in basis points (e.g. 500 = 5.00%).
   * @param {number} params.term - Loan term, in days.
   * @param {Date|string} params.maturityDate - When the loan matures.
   * @param {number|string} [params.totalAmountDue] - Principal + interest, if known.
   * @returns {Promise<Object>} `{ contractAddress, recordId, transactionHash }`
   */
  async createLoanContract({
    loanId,
    borrower,
    lender,
    amount,
    interestRate,
    term,
    maturityDate,
    totalAmountDue,
  }) {
    if (!this.loanRegistryAddress) {
      throw new AppError(
        "LoanRegistry contract address is not configured (set LOAN_REGISTRY_ADDRESS)",
        500,
        "BLOCKCHAIN_CONFIG_ERROR",
      );
    }
    if (!borrower || !ethers.isAddress(borrower)) {
      throw new AppError(
        "Borrower does not have a valid wallet address on file",
        400,
        "BLOCKCHAIN_MISSING_WALLET",
      );
    }
    if (!lender || !ethers.isAddress(lender)) {
      throw new AppError(
        "Lender does not have a valid wallet address on file",
        400,
        "BLOCKCHAIN_MISSING_WALLET",
      );
    }

    const offChainLoanId = this._loanIdToUint256(loanId);
    const termSeconds = BigInt(Math.round(Number(term || 0) * 86400));
    const maturityTimestamp = maturityDate
      ? BigInt(Math.floor(new Date(maturityDate).getTime() / 1000))
      : 0n;

    const result = await this.callContract(
      this.loanRegistryNetwork,
      this.loanRegistryAddress,
      this.loanRegistryAbi,
      "recordLoanFunded",
      [
        offChainLoanId,
        borrower,
        lender,
        ethers.parseUnits(amount.toString(), 18),
        BigInt(Math.round(Number(interestRate || 0))),
        termSeconds,
        maturityTimestamp,
        totalAmountDue ? ethers.parseUnits(totalAmountDue.toString(), 18) : 0n,
      ],
    );

    const fundedEvent = result.events.find((e) => e.name === "LoanFunded");

    return {
      contractAddress: this.loanRegistryAddress,
      recordId: fundedEvent ? fundedEvent.args.recordId.toString() : null,
      transactionHash: result.transactionHash,
    };
  }

  /**
   * Record a repayment against a loan previously anchored via
   * createLoanContract().
   *
   * @param {Object} params
   * @param {string} params.recordId - The LoanRegistry recordId returned by createLoanContract().
   * @param {number|string} params.amount - Repayment amount.
   * @returns {Promise<Object>} `{ transactionHash, isFullyRepaid }`
   */
  async recordRepayment({ recordId, amount }) {
    if (!this.loanRegistryAddress) {
      throw new AppError(
        "LoanRegistry contract address is not configured (set LOAN_REGISTRY_ADDRESS)",
        500,
        "BLOCKCHAIN_CONFIG_ERROR",
      );
    }
    if (recordId === undefined || recordId === null) {
      throw new AppError(
        "Cannot record a repayment without a LoanRegistry recordId " +
          "(this loan's on-chain funding record may have failed earlier)",
        400,
        "BLOCKCHAIN_MISSING_RECORD",
      );
    }

    const result = await this.callContract(
      this.loanRegistryNetwork,
      this.loanRegistryAddress,
      this.loanRegistryAbi,
      "recordRepayment",
      [BigInt(recordId), ethers.parseUnits(amount.toString(), 18)],
    );

    const repaymentEvent = result.events.find(
      (e) => e.name === "RepaymentRecorded",
    );

    return {
      transactionHash: result.transactionHash,
      isFullyRepaid: repaymentEvent ? repaymentEvent.args.isFullyRepaid : null,
    };
  }

  /**
   * Deterministically fold a Mongo ObjectId (or any id string) down into a
   * uint256 the registry contract can use as `offChainLoanId`.
   * @private
   */
  _loanIdToUint256(loanId) {
    const idString = loanId.toString();
    // Mongo ObjectIds are 24 hex chars and fit directly into a uint256.
    if (/^[0-9a-fA-F]{24}$/.test(idString)) {
      return BigInt(`0x${idString}`);
    }
    // Fall back to hashing anything else (plain numeric ids, UUIDs, etc.)
    // into the same 256-bit space.
    return BigInt(ethers.keccak256(ethers.toUtf8Bytes(idString)));
  }

  /**
   * Deploy a smart contract
   * @param {string} networkName - Network to deploy on
   * @param {Object} contractData - Contract bytecode and ABI
   * @param {Array} constructorArgs - Constructor arguments
   * @returns {Promise<Object>} Deployment result
   */
  async deployContract(networkName, contractData, constructorArgs = []) {
    try {
      logger.info("Starting contract deployment", {
        network: networkName,
        contractName: contractData.contractName,
      });

      const wallet = this.wallets.get(networkName);
      if (!wallet) {
        throw new AppError(
          `No wallet configured for network: ${networkName}`,
          400,
          "WALLET_ERROR",
        );
      }

      // Create contract factory
      const contractFactory = new ethers.ContractFactory(
        contractData.abi,
        contractData.bytecode,
        wallet,
      );

      // Estimate gas
      const estimatedGas = await contractFactory
        .getDeployTransaction(...constructorArgs)
        .then((tx) => wallet.estimateGas(tx));

      // Deploy contract with retry logic
      const contract = await this._executeWithRetry(async () => {
        return await contractFactory.deploy(...constructorArgs, {
          gasLimit: (estimatedGas * BigInt(120)) / BigInt(100), // 20% buffer
          maxFeePerGas: this.gasSettings.maxFeePerGas,
          maxPriorityFeePerGas: this.gasSettings.maxPriorityFeePerGas,
        });
      });

      // Wait for deployment
      await contract.waitForDeployment();
      const contractAddress = await contract.getAddress();

      // Store contract reference
      const contractKey = `${networkName}_${contractData.contractName}`;
      this.contracts.set(contractKey, contract);

      logger.info("Contract deployed successfully", {
        network: networkName,
        contractName: contractData.contractName,
        address: contractAddress,
        deploymentHash: contract.deploymentTransaction().hash,
      });

      return {
        address: contractAddress,
        transactionHash: contract.deploymentTransaction().hash,
        network: networkName,
        contractName: contractData.contractName,
        gasUsed: estimatedGas.toString(),
      };
    } catch (error) {
      logger.error("Contract deployment failed", {
        network: networkName,
        contractName: contractData.contractName,
        error: error.message,
        stack: error.stack,
      });

      throw new AppError(
        "Contract deployment failed",
        500,
        "DEPLOYMENT_ERROR",
        {
          originalError: error.message,
          network: networkName,
        },
      );
    }
  }

  /**
   * Interact with a smart contract
   * @param {string} networkName - Network name
   * @param {string} contractAddress - Contract address
   * @param {Array} abi - Contract ABI
   * @param {string} methodName - Method to call
   * @param {Array} args - Method arguments
   * @param {Object} options - Transaction options
   * @returns {Promise<Object>} Transaction result
   */
  async callContract(
    networkName,
    contractAddress,
    abi,
    methodName,
    args = [],
    options = {},
  ) {
    try {
      logger.info("Calling contract method", {
        network: networkName,
        contract: contractAddress,
        method: methodName,
        args: args.length,
      });

      const wallet = this.wallets.get(networkName);
      if (!wallet) {
        throw new AppError(
          `No wallet configured for network: ${networkName}`,
          400,
          "WALLET_ERROR",
        );
      }

      // Create contract instance
      const contract = new ethers.Contract(contractAddress, abi, wallet);

      // Check if method exists
      if (!contract[methodName]) {
        throw new AppError(
          `Method ${methodName} not found in contract`,
          400,
          "METHOD_ERROR",
        );
      }

      // Determine if this is a read or write operation
      const fragment = contract.interface.getFunction(methodName);
      const isReadOnly =
        fragment.stateMutability === "view" ||
        fragment.stateMutability === "pure";

      if (isReadOnly) {
        // Read operation
        const result = await contract[methodName](...args);

        logger.info("Contract read operation completed", {
          network: networkName,
          contract: contractAddress,
          method: methodName,
        });

        return {
          result,
          isReadOnly: true,
          network: networkName,
          contract: contractAddress,
          method: methodName,
        };
      } else {
        // Write operation - estimate gas first
        const estimatedGas = await contract[methodName].estimateGas(...args);

        // Execute transaction with retry logic
        const transaction = await this._executeWithRetry(async () => {
          return await contract[methodName](...args, {
            gasLimit: (estimatedGas * BigInt(120)) / BigInt(100), // 20% buffer
            maxFeePerGas: options.maxFeePerGas || this.gasSettings.maxFeePerGas,
            maxPriorityFeePerGas:
              options.maxPriorityFeePerGas ||
              this.gasSettings.maxPriorityFeePerGas,
            value: options.value || 0,
          });
        });

        // Wait for confirmation
        const receipt = await transaction.wait();

        logger.info("Contract write operation completed", {
          network: networkName,
          contract: contractAddress,
          method: methodName,
          transactionHash: receipt.hash,
          gasUsed: receipt.gasUsed.toString(),
        });

        return {
          transactionHash: receipt.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          status: receipt.status,
          events: this._parseEvents(receipt.logs, abi),
          isReadOnly: false,
          network: networkName,
          contract: contractAddress,
          method: methodName,
        };
      }
    } catch (error) {
      logger.error("Contract call failed", {
        network: networkName,
        contract: contractAddress,
        method: methodName,
        error: error.message,
        stack: error.stack,
      });

      throw new AppError("Contract interaction failed", 500, "CONTRACT_ERROR", {
        originalError: error.message,
        network: networkName,
        contract: contractAddress,
        method: methodName,
      });
    }
  }

  /**
   * Listen to contract events
   * @param {string} networkName - Network name
   * @param {string} contractAddress - Contract address
   * @param {Array} abi - Contract ABI
   * @param {string} eventName - Event name to listen for
   * @param {Function} callback - Callback function for events
   * @param {Object} filter - Event filter options
   */
  async listenToEvents(
    networkName,
    contractAddress,
    abi,
    eventName,
    callback,
    filter = {},
  ) {
    try {
      logger.info("Setting up event listener", {
        network: networkName,
        contract: contractAddress,
        event: eventName,
      });

      const provider = this.providers.get(networkName);
      if (!provider) {
        throw new AppError(
          `No provider configured for network: ${networkName}`,
          400,
          "PROVIDER_ERROR",
        );
      }

      // Create contract instance
      const contract = new ethers.Contract(contractAddress, abi, provider);

      // Set up event listener
      const eventFilter = contract.filters[eventName](...Object.values(filter));

      const listener = async (...args) => {
        try {
          const event = args[args.length - 1]; // Last argument is the event object

          logger.info("Event received", {
            network: networkName,
            contract: contractAddress,
            event: eventName,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
          });

          await callback({
            eventName,
            args: args.slice(0, -1), // Remove event object from args
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            address: event.address,
            network: networkName,
          });
        } catch (error) {
          logger.error("Error processing event", {
            network: networkName,
            contract: contractAddress,
            event: eventName,
            error: error.message,
          });
        }
      };

      contract.on(eventFilter, listener);

      // Store listener reference for cleanup
      const listenerKey = `${networkName}_${contractAddress}_${eventName}`;
      this.eventListeners.set(listenerKey, { contract, eventFilter, listener });

      logger.info("Event listener set up successfully", {
        network: networkName,
        contract: contractAddress,
        event: eventName,
      });

      return listenerKey;
    } catch (error) {
      logger.error("Failed to set up event listener", {
        network: networkName,
        contract: contractAddress,
        event: eventName,
        error: error.message,
      });

      throw new AppError(
        "Failed to set up event listener",
        500,
        "EVENT_LISTENER_ERROR",
        {
          originalError: error.message,
        },
      );
    }
  }

  /**
   * Remove event listener
   * @param {string} listenerKey - Listener key returned by listenToEvents
   */
  removeEventListener(listenerKey) {
    const listener = this.eventListeners.get(listenerKey);
    if (listener) {
      listener.contract.off(listener.eventFilter, listener.listener);
      this.eventListeners.delete(listenerKey);

      logger.info("Event listener removed", { listenerKey });
    }
  }

  /**
   * Get transaction status
   * @param {string} networkName - Network name
   * @param {string} transactionHash - Transaction hash
   * @returns {Promise<Object>} Transaction status
   */
  async getTransactionStatus(networkName, transactionHash) {
    try {
      const provider = this.providers.get(networkName);
      if (!provider) {
        throw new AppError(
          `No provider configured for network: ${networkName}`,
          400,
          "PROVIDER_ERROR",
        );
      }

      const transaction = await provider.getTransaction(transactionHash);
      const receipt = await provider.getTransactionReceipt(transactionHash);

      return {
        hash: transactionHash,
        status: receipt
          ? receipt.status === 1
            ? "success"
            : "failed"
          : "pending",
        blockNumber: receipt?.blockNumber || null,
        gasUsed: receipt?.gasUsed?.toString() || null,
        confirmations: transaction ? await transaction.confirmations() : 0,
        network: networkName,
      };
    } catch (error) {
      logger.error("Failed to get transaction status", {
        network: networkName,
        transactionHash,
        error: error.message,
      });

      throw new AppError(
        "Failed to get transaction status",
        500,
        "TRANSACTION_STATUS_ERROR",
        { originalError: error.message },
      );
    }
  }

  /**
   * Get network status
   * @param {string} networkName - Network name
   * @returns {Promise<Object>} Network status
   */
  async getNetworkStatus(networkName) {
    try {
      const provider = this.providers.get(networkName);
      if (!provider) {
        throw new AppError(
          `No provider configured for network: ${networkName}`,
          400,
          "PROVIDER_ERROR",
        );
      }

      const [blockNumber, gasPrice, network] = await Promise.all([
        provider.getBlockNumber(),
        provider.getFeeData(),
        provider.getNetwork(),
      ]);

      return {
        network: networkName,
        chainId: Number(network.chainId),
        blockNumber,
        gasPrice: {
          gasPrice: gasPrice.gasPrice?.toString(),
          maxFeePerGas: gasPrice.maxFeePerGas?.toString(),
          maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas?.toString(),
        },
        isConnected: true,
      };
    } catch (error) {
      logger.error("Failed to get network status", {
        network: networkName,
        error: error.message,
      });

      return {
        network: networkName,
        isConnected: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute operation with retry logic
   * @private
   */
  async _executeWithRetry(operation) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          logger.warn(
            `Blockchain operation attempt ${attempt} failed, retrying in ${delay}ms`,
            {
              error: error.message,
              attempt,
              maxAttempts: this.retryAttempts,
            },
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Parse events from transaction logs
   * @private
   */
  _parseEvents(logs, abi) {
    try {
      const iface = new ethers.Interface(abi);
      const events = [];

      for (const log of logs) {
        try {
          const parsedLog = iface.parseLog(log);
          if (parsedLog) {
            events.push({
              name: parsedLog.name,
              args: parsedLog.args,
              signature: parsedLog.signature,
            });
          }
        } catch (error) {
          // Log might not be from this contract, skip
          continue;
        }
      }

      return events;
    } catch (error) {
      logger.warn("Failed to parse events", { error: error.message });
      return [];
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Remove all event listeners
    for (const [key, listener] of this.eventListeners) {
      listener.contract.off(listener.eventFilter, listener.listener);
    }
    this.eventListeners.clear();

    // Clear providers and wallets
    this.providers.clear();
    this.wallets.clear();
    this.contracts.clear();

    logger.info("Blockchain service cleanup completed");
  }
}

module.exports = new BlockchainService();
