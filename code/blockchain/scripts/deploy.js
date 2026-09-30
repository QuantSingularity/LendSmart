const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // ── Deploy LoanContract ───────────────────────────────────────────────────
  const initialOwner = deployer.address;
  const initialFeeRate = 100; // 1.00% (basis points)
  const initialFeeRecipient = deployer.address;

  console.log("\nDeploying LoanContract...");
  const LoanContract = await hre.ethers.getContractFactory("LoanContract");
  const loanContract = await LoanContract.deploy(
    initialOwner,
    initialFeeRate,
    initialFeeRecipient,
  );
  await loanContract.waitForDeployment();
  const loanContractAddress = await loanContract.getAddress();
  console.log("LoanContract deployed to:", loanContractAddress);

  // ── Deploy LendSmartLoan ──────────────────────────────────────────────────
  const initialRiskAssessor =
    process.env.RISK_ASSESSOR_ADDRESS || deployer.address;

  console.log("\nDeploying LendSmartLoan...");
  const LendSmartLoan = await hre.ethers.getContractFactory("LendSmartLoan");
  const lendSmartLoan = await LendSmartLoan.deploy(
    initialOwner,
    initialFeeRate,
    initialFeeRecipient,
    initialRiskAssessor,
  );
  await lendSmartLoan.waitForDeployment();
  const lendSmartLoanAddress = await lendSmartLoan.getAddress();
  console.log("LendSmartLoan deployed to:", lendSmartLoanAddress);

  // ── Deploy LoanRegistry ───────────────────────────────────────────────────
  // Owned by the backend's operator wallet (the address whose private key
  // is configured as *_PRIVATE_KEY for this network) - that's the account
  // that will call recordLoanFunded/recordRepayment on the backend's behalf.
  const registryOperator =
    process.env.LOAN_REGISTRY_OPERATOR_ADDRESS || deployer.address;

  console.log("\nDeploying LoanRegistry...");
  const LoanRegistry = await hre.ethers.getContractFactory("LoanRegistry");
  const loanRegistry = await LoanRegistry.deploy(registryOperator);
  await loanRegistry.waitForDeployment();
  const loanRegistryAddress = await loanRegistry.getAddress();
  console.log("LoanRegistry deployed to:", loanRegistryAddress);
  console.log("LoanRegistry operator (owner):", registryOperator);

  // ── Save Artifacts ────────────────────────────────────────────────────────
  saveArtifacts({
    LoanContract: { contract: loanContract, address: loanContractAddress },
    LendSmartLoan: { contract: lendSmartLoan, address: lendSmartLoanAddress },
    LoanRegistry: { contract: loanRegistry, address: loanRegistryAddress },
  });

  // ── Print Summary ─────────────────────────────────────────────────────────
  console.log("\n=== Deployment Summary ===");
  console.log(`LoanContract:   ${loanContractAddress}`);
  console.log(`LendSmartLoan:  ${lendSmartLoanAddress}`);
  console.log(`LoanRegistry:   ${loanRegistryAddress}`);
  console.log("\nSave these addresses in your .env file:");
  console.log(`LOAN_CONTRACT_ADDRESS=${loanContractAddress}`);
  console.log(`LENDSMART_LOAN_CONTRACT_ADDRESS=${lendSmartLoanAddress}`);
  console.log(`LOAN_REGISTRY_ADDRESS=${loanRegistryAddress}`);
  console.log(
    "\nCopy code/blockchain/deployments/LoanRegistry.json's `abi` into " +
      "code/backend/src/config/contracts/LoanRegistry.abi.json if the " +
      "contract's interface changed, and set LOAN_REGISTRY_ADDRESS plus a " +
      "matching *_PRIVATE_KEY (for the registryOperator account above) in " +
      "the backend's environment.",
  );
}

function saveArtifacts(contracts) {
  const outputDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const deploymentInfo = {
    network: hre.network.name,
    timestamp: new Date().toISOString(),
    contracts: {},
  };

  for (const [name, { address }] of Object.entries(contracts)) {
    try {
      const artifact = hre.artifacts.readArtifactSync(name);
      const contractFile = {
        address,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
      };

      fs.writeFileSync(
        path.join(outputDir, `${name}.json`),
        JSON.stringify(contractFile, null, 2),
      );

      deploymentInfo.contracts[name] = address;
      console.log(`Artifact saved: deployments/${name}.json`);
    } catch (err) {
      console.warn(`Could not save artifact for ${name}:`, err.message);
    }
  }

  fs.writeFileSync(
    path.join(outputDir, "deployment.json"),
    JSON.stringify(deploymentInfo, null, 2),
  );
  console.log("Deployment info saved: deployments/deployment.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
