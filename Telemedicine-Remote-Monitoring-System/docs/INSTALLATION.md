// Filepath: /docs/INSTALLATION.md

# Installation Guide

This document provides step-by-step instructions to set up the Telemedicine Remote Monitoring System.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setting Up the Blockchain Network](#setting-up-the-blockchain-network)
- [Deploying Smart Contracts](#deploying-smart-contracts)
- [Setting Up the Mobile Application](#setting-up-the-mobile-application)
- [Compiling BLE Device Firmware](#compiling-ble-device-firmware)
- [Running Tests](#running-tests)
- [Configuration](#configuration)

## Prerequisites

- **Operating System**: Linux, macOS, or Windows (with WSL)
- **Node.js**: v14.x or higher
- **npm**: v6.x or higher
- **Go Ethereum (geth)**: Latest version
- **Truffle Suite**: v5.x
- **React Native CLI**: For mobile app development
- **C Compiler**: For BLE device firmware

## Setting Up the Blockchain Network

1. **Navigate to the blockchain network directory**:

   ```bash
   cd blockchain-network/

2. Initialize the network:
    cd scripts/
    ./init-network.sh

3. Start the nodes:
    Two nodes - so open two terminal windows (or as needed per your current setup.)

    First Terminal:
    ./start-node.sh node1

    Second Terminal:
    ./start-node.sh node2

    The add-validator.sh script is to add validator addresses.

## Deploying Smart Contracts

    1. Navigate to the smart contracts directory:

    cd smart-contracts/

    2. Install dependencies:

    npm install

    3. Compile the contracts:

    truffle compile

    4. Deploy the compiled contracts:

    truffle migrate --network the_private_network_being_used