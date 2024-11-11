// Filepath: /scripts/run-tests.sh

#!/bin/bash

# Run all unit and integration tests

echo "Running smart contract tests..."
cd ../smart-contracts/
truffle test

echo "Running mobile app tests..."
cd ../mobile-app/
npm test

echo "Running BLE device firmware tests..."
# Assuming tests are set up for firmware
cd ../ble-devices/code/DeviceFirmware/
make test

echo "All tests completed."
