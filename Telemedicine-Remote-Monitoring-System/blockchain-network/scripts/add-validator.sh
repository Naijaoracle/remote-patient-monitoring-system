// Filepath: /blockchain-network/scripts/add-validator.sh

#!/bin/bash

# Usage: ./add-validator.sh <validator_address>

if [ "$#" -ne 1 ]; then
    echo "Usage: ./add-validator.sh <validator_address>"
    exit 1
fi

VALIDATOR_ADDRESS=$1

echo "Proposing new validator: $VALIDATOR_ADDRESS"

geth attach http://127.0.0.1:8545 << EOF
clique.propose('$VALIDATOR_ADDRESS', true)
EOF
