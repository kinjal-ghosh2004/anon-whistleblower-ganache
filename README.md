# Anonymous Whistleblower Channel

## Description

This project provides a decentralized application (dApp) built on the Ethereum blockchain (run locally using Ganache or Truffle Develop) designed to facilitate anonymous communication for whistleblowers or sensitive sources. It allows users, identified only by their anonymous Ethereum addresses, to join group chats and send messages that expire after a specified duration. While the message content becomes inaccessible via the frontend after expiry, the blockchain retains a cryptographic hash of the message, providing immutable proof of its existence and integrity at a specific time. Administrators (like journalists, HR representatives, or NGO coordinators) can create and manage groups.

The primary goal is to offer a secure channel where sources can speak freely without immediate fear of exposure through traditional communication channels.

## Features

*   **Anonymous Participation:** Users interact using disposable Ethereum addresses provided by Ganache/Truffle Develop, without linking to real-world identities on-chain.
*   **Group Chats:** Users can join specific groups created by administrators.
*   **Expiring Messages:** Messages sent within groups have a defined expiry time. The frontend automatically hides messages past their expiry.
*   **On-Chain Verification:** A `keccak256` hash of each message's content is stored on the blockchain along with sender and timestamp details, ensuring message integrity can be verified.
*   **Admin Controls:** A designated admin account (the contract deployer by default) can create new communication groups.
*   **Local Development Focus:** Designed explicitly for local testing using Truffle and Ganache (GUI, CLI, or `truffle develop`), without reliance on external networks like Mainnet, testnets, or browser wallets like MetaMask.

## Technology Stack

*   **Blockchain:** Local Ethereum network provided by Ganache / Truffle Develop
*   **Smart Contracts:** Solidity (`v0.8.21`)
*   **Development Framework:** Truffle (`v5.11.5` or compatible)
*   **Runtime Environment:** Node.js (`v18.18.0`)
*   **Package Manager:** npm (`v9.8.1`)
*   **Frontend Library:** Web3.js (`v1.10.0`) - For interacting with the Ethereum blockchain.
*   **Frontend Structure:** HTML, CSS, JavaScript (Vanilla - no frameworks like React/Vue, no CSS libraries like Tailwind)
*   **Local Web Server:** `lite-server`

## Prerequisites

Before you begin, ensure you have the following installed:

1.  **Node.js:** Version `18.18.0` (This will include npm `v9.8.1`). We recommend using [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux) or [nvm-windows](https://github.com/coreybutler/nvm-windows) to manage Node versions.
    ```bash
    node -v # Should output v18.18.0
    npm -v  # Should output 9.8.1
    ```
2.  **Truffle:** Install globally.
    ```bash
    npm install -g truffle
    truffle version # Verify installation
    ```
3.  **Ganache:**
    *   **Option A (Recommended for Events):** Install [Ganache GUI](https://trufflesuite.com/ganache/) or [Ganache CLI](https://github.com/trufflesuite/ganache) (`npm install -g ganache`). Ganache provides better support for WebSocket connections needed for real-time event updates in the frontend.
    *   **Option B:** You can use the built-in `truffle develop` console, but be aware it uses HTTP which **does not support event subscriptions**, meaning the frontend UI won't update automatically when messages/groups/members change.

## Setup Instructions

1.  **Clone or Download:** Get the project files onto your local machine.
    ```bash
    # If using Git
    # git clone <repository-url>
    cd whistleblower-channel
    ```
2.  **Install Dependencies:** Install Node.js packages listed in `package.json` (mainly `lite-server`).
    ```bash
    npm install
    ```
3.  **Compile Contracts:** Compile the Solidity smart contract.
    ```bash
    truffle compile
    # Or, if running into global path issues:
    # npx truffle compile
    ```
    This creates the ABI file in the `build/contracts/` directory.

4.  **Run Blockchain Client:**
    *   **Using Ganache GUI:** Launch the application, click "Quickstart (Ethereum)". Note the RPC Server address (usually `HTTP://127.0.0.1:7545`). The WebSocket server is usually `ws://127.0.0.1:7545`.
    *   **Using Ganache CLI:** Open a **separate terminal** and run `ganache`. Note the listening address and port (e.g., `Listening on 127.0.0.1:8545`). The WebSocket server is usually `ws://127.0.0.1:8545`.
    *   **Using Truffle Develop:** Open a terminal and run `truffle develop`. Note the port (usually `9545`). **Remember: Event subscriptions will not work with this option.**

5.  **Configure Truffle Network:** Open `truffle-config.js`. Ensure the `networks.development.port` matches the port your chosen blockchain client is running on (e.g., `7545` for Ganache GUI default, `8545` for Ganache CLI default, `9545` for `truffle develop`). Adjust the `gas` and `gasPrice` settings if needed (defaults are usually fine for local development).

6.  **Deploy Contract:** Deploy the smart contract to your running local blockchain.
    *   **If using Ganache GUI/CLI:** In your project terminal:
        ```bash
        truffle migrate --reset --network development
        # Or:
        # npx truffle migrate --reset --network development
        ```
    *   **If using Truffle Develop:** In the `truffle develop>` console:
        ```bash
        # Inside truffle develop prompt
        migrate --reset
        ```
    **CRITICAL:** Copy the `contract address` output by the migration command.

7.  **Configure Frontend Contract Address:** Open `client/app.js`. Find the line `const contractAddress = "YOUR_DEPLOYED_CONTRACT_ADDRESS";` and paste the contract address you just copied.

8.  **Configure Frontend WebSocket URL:** Open `client/app.js`. Find the line `const ganacheWsUrl = "ws://127.0.0.1:xxxx";`. **Change the port `xxxx`** to match the port your Ganache instance (GUI or CLI) is running on (e.g., `ws://127.0.0.1:7545` or `ws://127.0.0.1:8545`). **Note:** This should point to Ganache GUI/CLI for events to work; `truffle develop` does not support the WebSocket connection needed here.

## Running the Application

1.  **Ensure Blockchain Client is Running:** Make sure your chosen instance of Ganache (GUI or CLI) is running.
2.  **Start Frontend Server:** In your project's root directory (`whistleblower-channel`), run:
    ```bash
    npm run dev
    ```
    This uses `lite-server` to serve the `client` directory and should automatically open the application in your default web browser (usually at `http://localhost:3000`).

3.  **Interact:**
    *   Use the dropdown to select different anonymous accounts provided by Ganache.
    *   If using the admin account (usually the first one), create groups.
    *   Use other accounts to join groups.
    *   Select a group you are a member of to send and view messages.
    *   Observe messages appearing/disappearing based on their expiry times.
    *   Check the browser's developer console (F12) for logs and potential errors.

## How it Works

*   **Anonymity:** Relies on using throwaway addresses from the local Ganache instance. No on-chain identity linkage is implemented.
*   **Message Expiry:** The `sendMessage` function stores an `expiresAt` timestamp ( `block.timestamp + duration`). The frontend fetches message metadata (including `expiresAt`) or receives messages via events. It then uses JavaScript `Date.now()` comparisons to hide messages where `expiresAt` is in the past. The actual message data (hash) remains on the blockchain indefinitely but the frontend loses access to the content retrieved via the initial event.
*   **Verification:** The contract calculates `keccak256(abi.encodePacked(messageContent))` and stores this hash. Anyone can theoretically recalculate the hash of alleged original content and compare it to the hash stored on-chain for a given message ID to verify authenticity and non-tampering.

## Directory Structure
whistleblower-channel/
├── client/ # Frontend files
│ ├── index.html # Main HTML page
│ ├── styles.css # Basic CSS styling
│ └── app.js # Frontend JavaScript logic (Web3 interaction)
├── contracts/ # Solidity smart contracts
│ └── WhistleblowerChat.sol # The main chat contract
├── migrations/ # Truffle deployment scripts
│ └── 1_deploy_contracts.js # Script to deploy WhistleblowerChat
├── test/ # Placeholder for Truffle tests (not implemented in this guide)
├── build/ # Truffle build artifacts (created after compilation)
│ └── contracts/
│ └── WhistleblowerChat.json # Contract ABI and metadata
├── node_modules/ # Node.js dependencies (created by npm install)
├── package.json # Project metadata and dependencies
├── package-lock.json # Exact dependency versions
└── truffle-config.js # Truffle configuration file (networks, compiler)

## Future Improvements

*   Implement formal tests using Truffle assertions (`test/` directory).
*   More robust group/message loading (using indexed events for efficient filtering).
*   Gas optimizations in the smart contract.
*   Enhanced admin roles (e.g., removing members, deleting groups).
*   Consideration of off-chain storage (e.g., IPFS) for message *content* if persistence beyond event listening is required, while carefully managing anonymity implications.
*   Improved UI/UX.
*   Error handling and user feedback enhancements.

## Team

*   Kinjal Ghosh (Leader)
*   Pratik A Shah (Co-Leader)
*   Drisanth M
*   Atharva Prashant Kolhe

---
