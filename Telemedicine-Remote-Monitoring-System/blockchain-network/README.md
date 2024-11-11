// Filepath: /blockchain-network/README.md

# Blockchain Network Setup

This directory contains the configuration files and scripts needed to set up the private blockchain network for the Telemedicine Remote Monitoring System.

## Prerequisites

- Go Ethereum (geth) installed on your system.
- Basic understanding of Ethereum node operations.

## Setup Instructions

### 1. Initialize the Network

Run the initialization script:

```bash
cd scripts/
./init-network.sh

2. Start the nodes - each in a seperate terminal window
    ./start-node.sh

3. Add Validators
    ./add-validator.sh <validator_address>

4. Also:
    Configuration Files
    genesis.json: Defines the genesis block and network parameters.
    config.toml: Contains node-specific configurations.
    Directories
    node1/ and node2/: Data directories for each node, containing their respective keystore and blockchain data.
    Notes
    Ensure that the static-nodes.json file contains the enode addresses of all nodes in the network.
    The nodes are set up to use the Clique Proof of Authority consensus mechanism.
