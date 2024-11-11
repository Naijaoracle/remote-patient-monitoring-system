// Filepath: /blockchain-network/scripts/start-node.sh

#!/bin/bash

# Start node1
geth --datadir node1 \
     --networkid 1234 \
     --port 30303 \
     --http \
     --http.addr "127.0.0.1" \
     --http.port 8545 \
     --http.api "admin,eth,net,web3,personal,miner,clique" \
     --allow-insecure-unlock \
     --unlock "0" \
     --password node1/password.txt \
     --mine \
     --verbosity 3 \
     console

# Start node2
geth --datadir node2 \
     --networkid 1234 \
     --port 30304 \
     --http \
     --http.addr "127.0.0.1" \
     --http.port 8546 \
     --http.api "admin,eth,net,web3,personal,miner,clique" \
     --allow-insecure-unlock \
     --unlock "0" \
     --password node2/password.txt \
     --mine \
     --verbosity 3 \
     console
