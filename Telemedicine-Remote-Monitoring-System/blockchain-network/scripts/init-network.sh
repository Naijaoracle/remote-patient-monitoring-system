// Filepath: /blockchain-network/scripts/init-network.sh

#!/bin/bash

# Initialize the blockchain network nodes

# Initialize node1
geth --datadir node1 init genesis.json

# Initialize node2
geth --datadir node2 init genesis.json

echo "Blockchain network initialized."
