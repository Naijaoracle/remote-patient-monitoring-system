// Filepath: /smart-contracts/README.md

# Smart Contracts for Telemedicine Remote Monitoring System

This directory contains the Solidity smart contracts and related scripts for the Telemedicine Remote Monitoring System.

## Contracts

- **Measurement.sol**: Smart contract for recording and emitting patient measurements.
- **ValidatorManager.sol**: Manages validator nodes and their roles.
- **Migrations.sol**: Used by Truffle for managing migrations.

## Getting Started

### Prerequisites

- Node.js and npm
- Truffle Suite
- Ganache CLI or a local Ethereum node

### Installation

1. Navigate to the `smart-contracts` directory:

   ```bash
   cd smart-contracts/

2. Install dependencies:
    npm install

3. Compile the smart contracts:
    truffle compile

4. Deploy the contracts to the development network:
    truffle migrate --network development

5. Run the test suite:
    truffle test

Adjust the truffle-config.js file to match the network settings.