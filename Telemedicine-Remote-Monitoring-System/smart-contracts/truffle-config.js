// Filepath: /smart-contracts/truffle-config.js

module.exports = {
    networks: {
      development: {
        host: "127.0.0.1",     // Localhost
        port: 8545,            // Standard Ethereum port
        network_id: "*",       // Any network
        // Use the prefunded signer from local genesis by default.
        from: process.env.TRUFFLE_FROM || "0xf3e63b5ad8ce0cc5e41d725a1a10d219681a5798",
      },
      private_network: {
        host: "127.0.0.1",
        port: 8545,
        network_id: "1234",
        gas: 8000000,
        from: process.env.TRUFFLE_FROM || "0xf3e63b5ad8ce0cc5e41d725a1a10d219681a5798",
      },
    },
    compilers: {
      solc: {
        // Pin compiler + EVM target so bytecode stays compatible with local geth 1.13 Clique chain.
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: "paris",
        },
      },
    },
  };
  
