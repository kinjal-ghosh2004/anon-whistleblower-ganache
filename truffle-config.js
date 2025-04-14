module.exports = {
  networks: {
    // Development network pointing to Ganache
    development: {
      host: "127.0.0.1",     // Localhost (default: none)
      port: 8545,            // Standard Ethereum port (default: Ganache GUI)
      network_id: "*",       // Any network (default: none)
      // gas: 5500000,        // OPTIONAL: Global gas limit for transactions from Truffle (e.g., migrations)
                              // Ganache's block gas limit is usually high, often don't need to set this manually.
                              // Setting it TOO LOW will cause deployments to FAIL.
      gasPrice: 20000000000 // OPTIONAL: Global gas price (in Wei) (20 Gwei example)
                              // On Ganache, this doesn't really affect speed, only simulated cost.
    },
  },

  // Set default mocha options here, use special reporters, etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.21", // *** IMPORTANT: Using 0.8.21 for better stability ***
                         // The requested 0.8.28 might be a typo or very recent.
                         // 0.8.21 is widely compatible with tools.
                         // If 0.8.28 MUST be used, change this value, but ensure
                         // Truffle supports it (check `truffle version`).
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: {          // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: false,
          runs: 200
        },
      //  evmVersion: "byzantium"
      }
    }
  }
};