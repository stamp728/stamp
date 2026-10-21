// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @dev Mirrors the ERC-8004 v2.0.0 semantics the lifecycle registry relies on:
///      register() defaults agentWallet to the owner, transfer clears agentWallet,
///      ownerOf reverts for unknown ids. Wallet proof is skipped here; the fork test
///      exercises the real EIP-712 path against the deployed registry.
contract MockIdentityRegistry {
    uint256 public lastId;
    mapping(uint256 => address) internal _owner;
    mapping(uint256 => address) internal _wallet;

    error ERC721NonexistentToken(uint256 tokenId);

    function register() external returns (uint256 id) {
        id = lastId++;
        _owner[id] = msg.sender;
        _wallet[id] = msg.sender;
    }

    function ownerOf(uint256 id) external view returns (address o) {
        o = _owner[id];
        if (o == address(0)) revert ERC721NonexistentToken(id);
    }

    function getAgentWallet(uint256 id) external view returns (address) {
        return _wallet[id];
    }

    function setAgentWallet(uint256 id, address w) external {
        require(msg.sender == _owner[id], "Not authorized");
        require(w != address(0), "bad wallet");
        _wallet[id] = w;
    }

    function unsetAgentWallet(uint256 id) external {
        require(msg.sender == _owner[id], "Not authorized");
        _wallet[id] = address(0);
    }

    function transferFrom(address from, address to, uint256 id) external {
        require(msg.sender == from && _owner[id] == from, "Not authorized");
        _owner[id] = to;
        _wallet[id] = address(0);
    }
}
