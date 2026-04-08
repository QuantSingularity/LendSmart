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

  // ── Save Artifacts ────────────────────────────────────────────────────────
  saveArtifacts({
    LoanContract: { contract: loanContract, address: loanContractAddress },
    LendSmartLoan: { contract: lendSmartLoan, address: lendSmartLoanAddress },
  });

  // ── Print Summary ─────────────────────────────────────────────────────────
  console.log("\n=== Deployment Summary ===");
  console.log(`LoanContract:   ${loanContractAddress}`);
  console.log(`LendSmartLoan:  ${lendSmartLoanAddress}`);
  console.log("\nSave these addresses in your .env file:");
  console.log(`LOAN_CONTRACT_ADDRESS=${loanContractAddress}`);
  console.log(`LENDSMART_LOAN_CONTRACT_ADDRESS=${lendSmartLoanAddress}`);
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
