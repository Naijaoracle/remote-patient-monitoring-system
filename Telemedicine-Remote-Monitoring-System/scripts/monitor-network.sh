// Filepath: /scripts/monitor-network.sh

#!/bin/bash

# Monitor the health of the blockchain network

echo "Connecting to the blockchain node..."
geth attach http://127.0.0.1:8545 << EOF
admin.nodeInfo
eth.syncing
net.peerCount
EOF
