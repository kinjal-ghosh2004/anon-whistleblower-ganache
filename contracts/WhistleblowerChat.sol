// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21; // Match version in truffle-config.js

contract WhistleblowerChat {

    // --- State Variables ---
    address public admin; // <<< ADDED: Address of the contract administrator (deployer)

    struct Message {
        uint id;
        address sender;
        bytes32 contentHash;
        uint timestamp;
        uint expiresAt;
        uint groupId;
        bool exists;
    }

    struct Group {
        uint id;
        string name;
        mapping(address => bool) isMember;
        address[] members;
        uint[] messageIds;
        bool exists;
    }

    uint private nextMessageId = 1;
    uint private nextGroupId = 1;

    mapping(uint => Message) public messages;
    mapping(uint => Group) public groups;
    mapping(uint => mapping(address => bool)) public memberInGroup;

    // --- Events ---
    event GroupCreated(uint indexed groupId, string name, address indexed createdBy);
    event MemberJoined(uint indexed groupId, address indexed member);
    event MessageSent(
        uint indexed messageId,
        uint indexed groupId,
        address indexed sender,
        string content,
        bytes32 contentHash,
        uint timestamp,
        uint expiresAt
    );

    // --- Modifiers ---
    modifier onlyAdmin() { // <<< ADDED: Modifier to restrict functions to the admin
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier onlyMember(uint _groupId) {
        require(groups[_groupId].exists, "Group does not exist");
        require(memberInGroup[_groupId][msg.sender], "You are not a member of this group");
        _;
    }

    // --- Constructor ---
    constructor() {
        admin = msg.sender; // <<< MODIFIED: Set the deployer as the admin on creation
    }

    // --- Admin Functions ---

    // Apply the onlyAdmin modifier here
    function createGroup(string memory _name) public onlyAdmin { // <<< MODIFIED: Added onlyAdmin
        uint groupId = nextGroupId++;
        groups[groupId].id = groupId;
        groups[groupId].name = _name;
        groups[groupId].exists = true;

        // <<< ADDED: Admin automatically joins the group they create >>>
        groups[groupId].isMember[msg.sender] = true;
        groups[groupId].members.push(msg.sender);
        memberInGroup[groupId][msg.sender] = true;

        emit GroupCreated(groupId, _name, msg.sender);
    }

    // --- Public Functions ---

    function joinGroup(uint _groupId) public {
        require(groups[_groupId].exists, "Group does not exist");
        require(!memberInGroup[_groupId][msg.sender], "Already a member");

        groups[_groupId].isMember[msg.sender] = true;
        groups[_groupId].members.push(msg.sender);
        memberInGroup[_groupId][msg.sender] = true;

        emit MemberJoined(_groupId, msg.sender);
    }

    function sendMessage(uint _groupId, string memory _content, uint _expiresInSeconds) public onlyMember(_groupId) {
        require(_expiresInSeconds > 0, "Expiration time must be positive");

        uint messageId = nextMessageId++;
        bytes32 contentHash = keccak256(abi.encodePacked(_content));
        uint timestamp = block.timestamp;
        uint expiresAt = timestamp + _expiresInSeconds;

        messages[messageId] = Message({
            id: messageId,
            sender: msg.sender,
            contentHash: contentHash,
            timestamp: timestamp,
            expiresAt: expiresAt,
            groupId: _groupId,
            exists: true
        });

        groups[_groupId].messageIds.push(messageId);

        emit MessageSent(messageId, _groupId, msg.sender, _content, contentHash, timestamp, expiresAt);
    }

    // --- View Functions (Read-only) ---

    function getGroupInfo(uint _groupId) public view returns (uint id, string memory name, address[] memory membersList) {
        require(groups[_groupId].exists, "Group does not exist");
        Group storage grp = groups[_groupId];
        return (grp.id, grp.name, grp.members);
    }

    function getActiveMessages(uint _groupId) public view returns (Message[] memory) {
       require(groups[_groupId].exists, "Group does not exist");

        uint[] storage messageIdList = groups[_groupId].messageIds;
        uint activeCount = 0;

        for (uint i = 0; i < messageIdList.length; i++) {
            Message storage msgData = messages[messageIdList[i]];
            if (msgData.exists && msgData.expiresAt > block.timestamp) {
                activeCount++;
            }
        }

        Message[] memory activeMessages = new Message[](activeCount);
        uint currentIndex = 0;
        for (uint i = 0; i < messageIdList.length; i++) {
             Message storage msgData = messages[messageIdList[i]];
             if (msgData.exists && msgData.expiresAt > block.timestamp) {
                activeMessages[currentIndex] = msgData;
                currentIndex++;
            }
        }
        return activeMessages;
    }

    // <<< ADDED: Helper function for frontend to check admin status >>>
     function isGroupAdmin(address _user) public view returns (bool) {
        return _user == admin;
     }
}