// --- Configuration ---
const contractAddress = "0x652e6d17053683642788390589e60899693e72aC";
const ganacheUrl = "http://127.0.0.1:8545";
const WEB3_GAS_PRICE = '20000000000';
const GAS_LIMIT_BUFFER = 30000;

// --- Global Variables ---
let web3;
let contract;
let accounts = [];
let currentAccount;
let contractABI; // Will be fetched
let currentGroupId = null;
let messageCache = {}; // { groupId: [ { id, sender, content, timestamp, expiresAt }, ... ] }
let groupList = {}; // { groupId: { id, name, members }, ... }


// --- DOM Elements ---
const connectionStatusEl = document.getElementById('connection-status');
const accountsSelect = document.getElementById('accounts');
const currentAccountEl = document.getElementById('current-account');
const adminStatusEl = document.getElementById('admin-status');
const adminPanelEl = document.getElementById('admin-panel');
const createGroupBtn = document.getElementById('create-group-btn');
const groupNameInput = document.getElementById('group-name');
const groupsListEl = document.getElementById('groups-list');
const selectedGroupNameEl = document.getElementById('selected-group-name');
const membersListEl = document.getElementById('members-list');
const messagesEl = document.getElementById('messages');
const messageInputAreaEl = document.getElementById('message-input-area');
const messageContentInput = document.getElementById('message-content');
const expiryDurationInput = document.getElementById('expiry-duration');
const sendMessageBtn = document.getElementById('send-message-btn');

// --- Initialization ---
window.addEventListener('load', async () => {
    // 1. Fetch the ABI
    try {
        const response = await fetch('./contracts/WhistleblowerChat.json'); // Adjust path if needed
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const artifact = await response.json();
        contractABI = artifact.abi;
        console.log("Contract ABI loaded");
    } catch (error) {
        connectionStatusEl.textContent = "Error loading contract ABI. Make sure you compiled and the path is correct.";
        connectionStatusEl.style.color = 'red';
        console.error("ABI Load Error:", error);
        return; // Stop initialization if ABI fails
    }

     // Check if ABI and address are valid before proceeding
    if (!contractABI || contractAddress === "YOUR_CONTRACT_ADDRESS" || contractAddress === "") {
        connectionStatusEl.textContent = "Contract ABI loaded, but Contract Address is not set in app.js! Please paste it.";
        connectionStatusEl.style.color = 'red';
        console.error("Contract address missing in app.js");
        return;
    }

    // 2. Initialize Web3 (Forcing Ganache Provider)
    console.log(`Attempting to connect to Ganache via WebSocket: ${ganacheUrl}`);
    const provider = new Web3.providers.WebsocketProvider(ganacheUrl);

    provider.on('connect', () => console.log('WebSocket Provider Connected'));
    provider.on('error', e => {
        console.error('WebSocket Provider Error:', e);
        connectionStatusEl.textContent = `WebSocket Error. Ensure Ganache is running at ${ganacheUrl} and supports WS.`;
        connectionStatusEl.style.color = 'red';
    });
    provider.on('end', e => {
         console.error('WebSocket Provider Ended:', e);
         connectionStatusEl.textContent = `WebSocket disconnected from ${ganacheUrl}. Restart Ganache & refresh.`;
         connectionStatusEl.style.color = 'red';
     });

    web3 = new Web3(provider);

    // 3. Instantiate Contract
    contract = new web3.eth.Contract(contractABI, contractAddress);
    console.log("Contract instantiated at address:", contractAddress);

    // 4. Load Accounts from Ganache
    await loadAccounts();

    // 5. Load initial groups
    await loadGroups();

    // 6. Set up event listeners for contract events
    setupEventListeners();

    // 7. Set up UI event listeners
    setupUIListeners();

    // 8. Start checking for expired messages periodically
    setInterval(checkExpiredMessages, 5000); // Check every 5 seconds

    connectionStatusEl.textContent = "Connected to Ganache.";
    connectionStatusEl.style.color = 'green';
});

// --- Web3 and Contract Interaction Functions ---

async function loadAccounts() {
    try {
        accounts = await web3.eth.getAccounts();
        console.log("Accounts loaded:", accounts);
        if (accounts.length === 0) {
            connectionStatusEl.textContent = "No accounts found. Make sure Ganache is running and configured.";
            connectionStatusEl.style.color = 'orange';
            return;
        }

        accountsSelect.innerHTML = ''; // Clear previous options
        accounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account;
            option.textContent = account;
            accountsSelect.appendChild(option);
        });

        // Set default account
        if (!currentAccount && accounts.length > 0) {
            setAccount(accounts[0]);
        } else if (currentAccount && !accounts.includes(currentAccount)) {
             // Handle case where previously selected account disappears (e.g., Ganache restart)
            setAccount(accounts[0]);
        } else {
             // Keep current account if it's still valid
            setAccount(currentAccount);
        }

    } catch (error) {
        connectionStatusEl.textContent = "Error loading accounts from Ganache.";
        connectionStatusEl.style.color = 'red';
        console.error("Account Load Error:", error);
    }
}

function setAccount(account) {
    currentAccount = account;
    currentAccountEl.textContent = account;
    accountsSelect.value = account; // Sync dropdown
    console.log("Current account set to:", currentAccount);

    // <<< ADD THIS LINE >>>
    checkAdminStatus(); // Check admin status whenever the account changes

    // Refresh group memberships and UI elements that depend on the current user
    displayGroups();
    if (currentGroupId !== null) {
        // Attempt to re-select the group to update context, like send button visibility
         const groupExists = !!groupList[currentGroupId];
         if(groupExists) {
            selectGroup(currentGroupId);
         } else {
             // Handle case where the previously selected group might not exist anymore
             // or wasn't loaded correctly after an account change.
             // Reset the selected group view.
             selectedGroupNameEl.textContent = "None";
             membersListEl.innerHTML = '';
             messagesEl.innerHTML = '<p>Select a group to see messages.</p>';
             messageInputAreaEl.style.display = 'none';
             currentGroupId = null;
         }
    }
}

async function checkAdminStatus() {
    if (!contract || !currentAccount) return;
    try {
        const isAdmin = await contract.methods.isGroupAdmin(currentAccount).call();
        adminStatusEl.textContent = isAdmin ? "Yes" : "No";
        adminPanelEl.style.display = isAdmin ? 'block' : 'none';
    } catch (error) {
        adminStatusEl.textContent = "Error";
        console.error("Error checking admin status:", error);
    }
}

async function loadGroups() {
    if (!contract) return;
    console.log("Loading groups...");
    groupsListEl.innerHTML = 'Loading...';
    try {
        // This is inefficient for many groups. In a real app, use events or indexed calls.
        // For this demo, we'll try fetching potential group IDs.
        let fetchedGroups = {};
        let id = 1;
        let attempts = 0;
        const maxAttempts = 20; // Limit attempts to avoid infinite loop if IDs are sparse

        // Try fetching groups sequentially until we hit a non-existent one or max attempts
        while(attempts < maxAttempts) {
             try {
                // Using call() for read-only operations
                const groupInfo = await contract.methods.getGroupInfo(id).call();
                 // groupInfo will be an array/object depending on web3 version and return struct
                 // Typically: [id, name, membersArray] or {0: id, 1: name, 2: membersArray, id: id, name: name, membersList: membersArray}
                 if (groupInfo && groupInfo.id && groupInfo.id.toString() === id.toString()) { // Check if the returned ID matches
                    fetchedGroups[id] = {
                        id: parseInt(groupInfo.id || groupInfo[0]),
                        name: groupInfo.name || groupInfo[1],
                        members: groupInfo.membersList || groupInfo[2] || [] // Handle different return formats
                    };
                    console.log(`Fetched Group ${id}:`, fetchedGroups[id].name);
                    id++;
                    attempts = 0; // Reset attempts if a group is found
                 } else {
                     // If getGroupInfo doesn't throw but returns invalid data for an ID, break
                     console.log(`Stopping group fetch at ID ${id}, likely end of groups.`);
                     break;
                 }

             } catch(e) {
                 // If the call reverts (likely 'Group does not exist'), stop fetching for this sequence.
                 console.log(`Stopping group fetch at ID ${id} due to error (likely not found):`, e.message);
                 break; // Exit the loop if a group ID doesn't exist
             }
             attempts++;
         }
        if (attempts >= maxAttempts) {
             console.warn("Stopped fetching groups after max attempts.");
        }


        groupList = fetchedGroups;
        displayGroups();

    } catch (error) {
        groupsListEl.innerHTML = 'Error loading groups.';
        console.error("Error loading groups:", error);
    }
}


function displayGroups() {
    groupsListEl.innerHTML = ''; // Clear existing list
    if (Object.keys(groupList).length === 0) {
        groupsListEl.innerHTML = 'No groups created yet.';
        return;
    }

    Object.values(groupList).forEach(group => {
        const div = document.createElement('div');
        div.classList.add('group-item');
        div.innerHTML = `
            <span>${group.id}: ${group.name} (${group.members.length} members)</span>
            <button class="select-group-btn" data-groupid="${group.id}">Select</button>
            <button class="join-group-btn" data-groupid="${group.id}" ${group.members.includes(currentAccount) ? 'disabled' : ''}>
                ${group.members.includes(currentAccount) ? 'Joined' : 'Join'}
            </button>
        `;
        groupsListEl.appendChild(div);
    });

    // Add event listeners for the new buttons
    document.querySelectorAll('.select-group-btn').forEach(button => {
        button.addEventListener('click', () => selectGroup(button.dataset.groupid));
    });
    document.querySelectorAll('.join-group-btn').forEach(button => {
        if (!button.disabled) { // Only add listener if not already joined
             button.addEventListener('click', () => joinGroup(button.dataset.groupid));
        }
    });
}

async function selectGroup(groupId) {
    currentGroupId = parseInt(groupId);
    const group = groupList[currentGroupId];
    if (!group) {
        console.error("Selected group not found in local list:", currentGroupId);
        selectedGroupNameEl.textContent = "Error";
        messageInputAreaEl.style.display = 'none';
        messagesEl.innerHTML = '<p>Error selecting group.</p>';
        membersListEl.innerHTML = '';
        return;
    }

    console.log("Selecting group:", currentGroupId, group.name);
    selectedGroupNameEl.textContent = `${group.name} (ID: ${group.id})`;

    // Display members
    membersListEl.innerHTML = `<strong>Members:</strong> ${group.members.join(', ')}`;


    // Check if current user is a member to enable sending messages
    const isMember = group.members.includes(currentAccount);
    messageInputAreaEl.style.display = isMember ? 'block' : 'none';
    if (!isMember) {
         messagesEl.innerHTML = '<p>Join this group to send and view messages.</p>';
         return; // Don't load/display messages if not a member
    }


    // Load and display messages for the selected group
    displayMessages(currentGroupId);
    // Optionally fetch historical messages if needed (or rely solely on cache from events)
    // await loadHistoricalMessages(currentGroupId); // Implement this if needed
}


async function joinGroup(groupId) {
    if (!contract || !currentAccount) return alert("Please select an account first.");
    console.log(`Attempting to join group ${groupId} as ${currentAccount}`);
    const joinButton = document.querySelector(`.join-group-btn[data-groupid="${groupId}"]`);

    try {
        if (joinButton) joinButton.disabled = true;
        if (joinButton) joinButton.textContent = 'Joining...';

        // 1. Estimate Gas
        const estimatedGas = await contract.methods.joinGroup(groupId)
                                     .estimateGas({ from: currentAccount });
        console.log(`Join Group ${groupId} - Estimated Gas: ${estimatedGas}`);

        // 2. Send Transaction
        const receipt = await contract.methods.joinGroup(groupId).send({
            from: currentAccount,
            gas: estimatedGas + GAS_LIMIT_BUFFER,
            gasPrice: WEB3_GAS_PRICE
        });

        console.log(`Successfully sent join request for group ${groupId}. Tx Hash: ${receipt.transactionHash}`);
        console.log(`Actual Gas Used: ${receipt.gasUsed}`);
        // UI update relies on events

    } catch (error) {
        alert(`Error joining group: ${error.message}`);
        console.error("Join Group Error:", error);
         if (error.message.includes("out of gas") || (error.receipt && !error.receipt.status)) {
             console.error("Transaction may have run out of gas. Estimated:", estimatedGas, "Buffer:", GAS_LIMIT_BUFFER);
        }
        if (joinButton) joinButton.disabled = false;
        if (joinButton) joinButton.textContent = 'Join';
    }
    // Note: Button state might need more robust handling if event listener doesn't fire immediately or fails
}

async function createGroup() {
    if (!contract || !currentAccount) return alert("Please select an admin account first.");
    const name = groupNameInput.value.trim();
    if (!name) return alert("Please enter a group name.");

    console.log(`Attempting to create group "${name}" as admin ${currentAccount}`);
    createGroupBtn.disabled = true;
    createGroupBtn.textContent = 'Creating...';

    try {
        // 1. Estimate Gas
        const estimatedGas = await contract.methods.createGroup(name)
                                     .estimateGas({ from: currentAccount });
        console.log(`Create Group - Estimated Gas: ${estimatedGas}`);

        // 2. Send Transaction with explicit gas limit and price
        const receipt = await contract.methods.createGroup(name).send({
            from: currentAccount,
            gas: estimatedGas + GAS_LIMIT_BUFFER, // Use estimate + buffer
            gasPrice: WEB3_GAS_PRICE             // Use defined gas price
        });

        console.log(`Successfully sent create group request. Tx Hash: ${receipt.transactionHash}`);
        console.log(`Actual Gas Used: ${receipt.gasUsed}`);
        groupNameInput.value = '';
        // Events should handle UI update if subscriptions work, otherwise manual refresh needed:
        // if (provider does not support subscriptions) { await loadGroups(); }

    } catch (error) {
        alert(`Error creating group: ${error.message}`);
        console.error("Create Group Error:", error);
        if (error.message.includes("out of gas") || (error.receipt && !error.receipt.status)) {
             console.error("Transaction may have run out of gas. Estimated:", estimatedGas, "Buffer:", GAS_LIMIT_BUFFER);
        }
    } finally {
        createGroupBtn.disabled = false;
        createGroupBtn.textContent = 'Create Group';
    }
}


async function sendMessage() {
    if (!contract || !currentAccount || currentGroupId === null) return alert("Select an account and a group first.");

    const content = messageContentInput.value.trim();
    const expirySeconds = parseInt(expiryDurationInput.value);

    if (!content) return alert("Message content cannot be empty.");
    if (isNaN(expirySeconds) || expirySeconds <= 0) return alert("Invalid expiry duration.");

    console.log(`Sending message to group ${currentGroupId}...`);
    sendMessageBtn.disabled = true;
    sendMessageBtn.textContent = 'Sending...';

    let estimatedGas = 0; // Initialize outside try block for error reporting

    try {
        // 1. Estimate Gas
        estimatedGas = await contract.methods.sendMessage(currentGroupId, content, expirySeconds)
                                 .estimateGas({ from: currentAccount });
        console.log(`Send Message (Group ${currentGroupId}) - Estimated Gas: ${estimatedGas}`);

        // 2. Send Transaction
        const receipt = await contract.methods.sendMessage(currentGroupId, content, expirySeconds).send({
            from: currentAccount,
            gas: estimatedGas + GAS_LIMIT_BUFFER, // Use estimate + buffer
            gasPrice: WEB3_GAS_PRICE
        });

        console.log(`Message sent successfully. Tx Hash: ${receipt.transactionHash}`);
        console.log(`Actual Gas Used: ${receipt.gasUsed}`);
        messageContentInput.value = '';
        // UI update relies on events

    } catch (error) {
        alert(`Error sending message: ${error.message}`);
        console.error("Send Message Error:", error);
        if (error.message.includes("out of gas") || (error.receipt && !error.receipt.status)) {
             console.error("Transaction may have run out of gas. Estimated:", estimatedGas, "Buffer:", GAS_LIMIT_BUFFER);
        }
    } finally {
        sendMessageBtn.disabled = false;
        sendMessageBtn.textContent = 'Send Message';
    }
}

// --- Event Handling ---

function setupEventListeners() {
    if (!contract) return;

    console.log("Setting up contract event listeners...");

    // Listen for new groups
    contract.events.GroupCreated({})
        .on('data', (event) => {
            console.log("EVENT GroupCreated:", event.returnValues);
            const { groupId, name, createdBy } = event.returnValues;
            const newGroup = {
                id: parseInt(groupId),
                name: name,
                members: [createdBy] // Admin is the first member
            };
            groupList[newGroup.id] = newGroup;
            displayGroups(); // Refresh the entire list
            alert(`New group created: ${name} (ID: ${groupId})`);
        })
        .on('error', (error) => {
            console.error("Error in GroupCreated event:", error);
        });

    // Listen for new members
    contract.events.MemberJoined({})
        .on('data', (event) => {
            console.log("EVENT MemberJoined:", event.returnValues);
            const { groupId, member } = event.returnValues;
            const groupIdNum = parseInt(groupId);
            if (groupList[groupIdNum] && !groupList[groupIdNum].members.includes(member)) {
                groupList[groupIdNum].members.push(member);
                 // Update UI if this group is selected or if the member is the current user
                if (currentGroupId === groupIdNum) {
                    selectGroup(groupIdNum); // Refresh selected group view (members list)
                }
                if (member === currentAccount) {
                     alert(`You successfully joined group ${groupList[groupIdNum].name}!`);
                     displayGroups(); // Refresh group list to update "Join" button state
                     // If the group they just joined is selected, refresh the view fully
                     if (currentGroupId === groupIdNum) {
                        selectGroup(groupIdNum);
                    }
                } else {
                     // Optionally show a notification that someone else joined
                     // alert(`User ${member} joined group ${groupList[groupIdNum].name}`);
                }
            }
        })
        .on('error', (error) => {
            console.error("Error in MemberJoined event:", error);
        });

    // Listen for new messages
    contract.events.MessageSent({})
        .on('data', (event) => {
            console.log("EVENT MessageSent:", event.returnValues);
            const { messageId, groupId, sender, content, contentHash, timestamp, expiresAt } = event.returnValues;
            const msgData = {
                id: parseInt(messageId),
                groupId: parseInt(groupId),
                sender: sender,
                content: content, // <<< Store the actual content from the event
                contentHash: contentHash,
                timestamp: parseInt(timestamp),
                expiresAt: parseInt(expiresAt),
                isExpired: false // Initial state
            };

            // Add to cache
            if (!messageCache[msgData.groupId]) {
                messageCache[msgData.groupId] = [];
            }
            // Avoid duplicates if event fires multiple times (though unlikely with .once or proper handling)
            if (!messageCache[msgData.groupId].some(m => m.id === msgData.id)) {
                 messageCache[msgData.groupId].push(msgData);
                 // Sort messages by timestamp (newest first)
                 messageCache[msgData.groupId].sort((a, b) => b.timestamp - a.timestamp);
            }


            // If the message belongs to the currently selected group, update the display
            if (msgData.groupId === currentGroupId) {
                displayMessages(currentGroupId);
            }
        })
        .on('error', (error) => {
            console.error("Error in MessageSent event:", error);
        });
}

function setupUIListeners() {
    accountsSelect.addEventListener('change', (e) => {
        setAccount(e.target.value);
    });

    createGroupBtn.addEventListener('click', createGroup);
    sendMessageBtn.addEventListener('click', sendMessage);
}

// --- Message Display and Expiration ---

function displayMessages(groupId) {
    messagesEl.innerHTML = ''; // Clear current messages

    if (!messageCache[groupId] || messageCache[groupId].length === 0) {
        messagesEl.innerHTML = '<p>No messages in this group yet, or old messages have expired.</p>';
        return;
    }

    const now = Math.floor(Date.now() / 1000); // Current time in seconds

    messageCache[groupId].forEach(msg => {
        // Check if the message is already marked as expired OR if its time is up
        if (msg.isExpired || msg.expiresAt <= now) {
             msg.isExpired = true; // Mark it permanently expired in cache
             // Do not display expired messages
             return; // Skip rendering this message
        }

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.dataset.messageId = msg.id; // Store ID for potential future use

        const sentDate = new Date(msg.timestamp * 1000).toLocaleString();
        const expiryDate = new Date(msg.expiresAt * 1000).toLocaleString();
        const timeRemaining = msg.expiresAt - now;

        messageDiv.innerHTML = `
            <span class="message-sender">From: ${msg.sender}</span>
            <p class="message-content">${escapeHTML(msg.content)}</p> <!-- Escape HTML to prevent XSS -->
            <div class="message-meta">
                <span>Sent: ${sentDate} | Expires: ${expiryDate} (~${timeRemaining}s left)</span>
                <br>
                <span style="font-size: 0.8em; word-wrap: break-word;">Hash: ${msg.contentHash}</span>
            </div>
        `;
        messagesEl.appendChild(messageDiv);
    });

     // Add a message if all messages were filtered out (expired)
     if (messagesEl.children.length === 0) {
         messagesEl.innerHTML = '<p>No active messages. Previous messages may have expired.</p>';
     }
}

function checkExpiredMessages() {
    if (currentGroupId === null || !messageCache[currentGroupId]) {
        return; // No group selected or no messages cached for it
    }

    let needsRedraw = false;
    const now = Math.floor(Date.now() / 1000);

    messageCache[currentGroupId].forEach(msg => {
        if (!msg.isExpired && msg.expiresAt <= now) {
            msg.isExpired = true;
            needsRedraw = true; // Mark that the display needs updating
            console.log(`Message ${msg.id} in group ${currentGroupId} expired.`);
        }
    });

    // If any message expired in the current view, redraw the message list
    if (needsRedraw) {
        console.log("Redrawing messages due to expiration check.");
        displayMessages(currentGroupId);
    }
}

// --- Utility Functions ---
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, function (match) {
    return {
      '&': '&',
      '<': '<',
      '>': '>',
      '"': '"',
      "'": `'`
    }[match];
  });
}

async function checkAdminStatus() {
    if (!contract || !currentAccount) return;
    try {
        // Call the view function on the contract
        const isAdmin = await contract.methods.isGroupAdmin(currentAccount).call();
        adminStatusEl.textContent = isAdmin ? "Yes" : "No";
        // Show/hide the admin panel based on the result
        adminPanelEl.style.display = isAdmin ? 'block' : 'none';
         console.log(`Account ${currentAccount} admin status: ${isAdmin}`);
    } catch (error) {
        adminStatusEl.textContent = "Error";
        adminPanelEl.style.display = 'none'; // Hide panel on error
        console.error("Error checking admin status:", error);
    }
}