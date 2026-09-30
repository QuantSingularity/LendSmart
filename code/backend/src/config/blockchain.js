/**
 * Blockchain configuration for LendSmart
 */
module.exports = {
  // RPC URL for the blockchain network
  rpcUrl: process.env.BLOCKCHAIN_RPC_URL || "http://localhost:8545",

  // Chain ID for the network
  chainId: process.env.BLOCKCHAIN_CHAIN_ID || 1337,

  // Smart contract addresses
  lendSmartLoanAddress:
    process.env.LEND_SMART_LOAN_ADDRESS ||
    "0x5FbDB2315678afecb367f032d93F642f64180aa3",

  // LoanRegistry: the operator-written audit-anchor contract that
  // BlockchainService.createLoanContract()/recordRepayment() write to. See
  // code/blockchain/contracts/LoanRegistry.sol for why this is a registry
  // rather than the escrow contracts above - this platform is custodial
  // (KYC + a payment processor move the actual funds) and relays every
  // write from a single backend-held operator wallet, so it can't safely
  // use msg.sender-attributed escrow functions on behalf of real users.
  loanRegistryAddress: process.env.LOAN_REGISTRY_ADDRESS || null,

  // Which network key (must match blockchainService's `networks` map, e.g.
  // "ethereum" | "polygon" | "sepolia") the LoanRegistry is deployed to,
  // and whose <NETWORK>_PRIVATE_KEY the operator wallet signs with.
  loanRegistryNetwork: process.env.LOAN_REGISTRY_NETWORK || "sepolia",

  // Gas settings
  gasLimit: process.env.GAS_LIMIT || 3000000,

  // Block confirmation count
  confirmations: process.env.CONFIRMATIONS || 1,
};
