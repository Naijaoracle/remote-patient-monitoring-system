// Filepath: /smart-contracts/truffle-config.js

module.exports = {
    networks: {
      development: {
        host: "127.0.0.1",     // Localhost
        port: 8545,            // Standard Ethereum port
        network_id: "*",       // Any network
      },
      private_network: {
        host: "127.0.0.1",
        port: 8545,
        network_id: "1234",
        gas: 8000000,
      },
    },
    compilers: {
      solc: {
        version: "^0.8.0",    // Fetch exact version from solc-bin
      },
    },
  };
  