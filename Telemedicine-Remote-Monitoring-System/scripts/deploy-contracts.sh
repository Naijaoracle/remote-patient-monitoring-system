// Filepath: /scripts/deploy-contracts.sh

#!/bin/bash

# Deploy smart contracts to the private blockchain network

echo "Navigating to smart-contracts directory..."
cd ../smart-contracts/

echo "Compiling contracts..."
truffle compile

echo "Deploying contracts to private network..."
truffle migrate --network private_network

echo "Deployment complete."
