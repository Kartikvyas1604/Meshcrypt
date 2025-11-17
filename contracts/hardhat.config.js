require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);
const INFURA_KEY = process.env.INFURA_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      allowUnlimitedContractSize: true,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 1,
    },
    polygon: {
      url: `https://polygon-mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 137,
    },
    polygonMumbai: {
      url: `https://polygon-mumbai.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 80001,
    },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 42161,
    },
    optimism: {
      url: `https://optimism-mainnet.infura.io/v3/${INFURA_KEY}`,
      accounts: [PRIVATE_KEY],
      chainId: 10,
    },
  },
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    excludeContracts: [],
    src: "./contracts",
  },
  paths: {
    sources: "./solidity",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
};
