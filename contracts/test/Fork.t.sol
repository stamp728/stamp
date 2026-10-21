// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgentLifecycleRegistry, IERC8004Identity} from "../src/AgentLifecycleRegistry.sol";

interface IIdentityRegistryFull is IERC8004Identity {
    function register(string calldata agentURI) external returns (uint256);
    function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes calldata signature) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function eip712Domain()
        external
        view
        returns (bytes1, string memory, string memory, uint256, address, bytes32, uint256[] memory);
    function getVersion() external pure returns (string memory);
}

/// @dev ERC-1271 wallet whose single signer key is `signer`.
contract SimpleSmartWallet {
    address public immutable signer;

    constructor(address s) {
        signer = s;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        (bytes32 r, bytes32 s) = abi.decode(sig[:64], (bytes32, bytes32));
        uint8 v = uint8(sig[64]);
        return ecrecover(hash, v, r, s) == signer ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

/// Runs against the live ERC-8004 IdentityRegistry on BNB Smart Chain mainnet.
///   forge test --match-contract Fork --fork-url https://bsc-rpc.publicnode.com
contract ForkTest is Test {
    IIdentityRegistryFull constant ID = IIdentityRegistryFull(0x8004A169FB4a3325136EB29fA0ceB6D2e539a432);
    bytes32 constant WALLET_TYPEHASH = keccak256("AgentWalletSet(uint256 agentId,address newWallet,address owner,uint256 deadline)");
    bytes32 constant POLICY = keccak256("policy");
    bytes32 constant EV = keccak256("evidence");

    AgentLifecycleRegistry reg;
    address owner = makeAddr("fork-owner");
    address controller = makeAddr("fork-controller");
    uint256 walletPk = 0xC0FFEE;
    address wallet;

    function setUp() public {
        if (block.chainid != 56) vm.skip(true);
        reg = new AgentLifecycleRegistry(ID);
        wallet = vm.addr(walletPk);
    }

    function _walletSig(uint256 agentId, address newWallet, address agentOwner, uint256 deadline, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = ID.eip712Domain();
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifying
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domain, keccak256(abi.encode(WALLET_TYPEHASH, agentId, newWallet, agentOwner, deadline)))
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _newAgent() internal returns (uint256 agentId) {
        vm.prank(owner);
        agentId = ID.register("data:application/json;base64,e30=");
        uint256 deadline = block.timestamp + 240;
        bytes memory sig = _walletSig(agentId, wallet, owner, deadline, walletPk);
        vm.prank(owner);
        ID.setAgentWallet(agentId, wallet, deadline, sig);
    }

    function test_fork_registryIsWhatWePinned() public view {
        assertEq(ID.getVersion(), "2.0.0");
        (, string memory name, string memory version, uint256 chainId, address verifying,,) = ID.eip712Domain();
        assertEq(name, "ERC8004IdentityRegistry");
        assertEq(version, "1");
        assertEq(chainId, 56);
        assertEq(verifying, address(ID));
        assertEq(reg.agentRegistry(), "eip155:56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432");
    }

    function test_fork_defaultWalletIsOwner_rejected() public {
        vm.prank(owner);
        uint256 agentId = ID.register("data:application/json;base64,e30=");
        assertEq(ID.getAgentWallet(agentId), owner);
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.DedicatedWalletRequired.selector);
        reg.register(agentId, controller, POLICY, EV, "op");
    }

    function test_fork_fullLifecycle() public {
        uint256 agentId = _newAgent();
        assertEq(ID.getAgentWallet(agentId), wallet);

        vm.prank(owner);
        reg.register(agentId, controller, POLICY, EV, "reg");
        vm.prank(controller);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "act");
        (,,, bool op) = reg.liveStatus(agentId);
        assertTrue(op);

        // Real handshake signed by the bound wallet.
        uint256 t = block.timestamp;
        bytes32 d = reg.handshakeDigest(agentId, "https://client.example", keccak256("n"), keccak256("desc"), 2, 1, t, t + 300);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(walletPk, d);
        (bool ok, uint8 reason) =
            reg.verifyHandshake(agentId, "https://client.example", keccak256("n"), keccak256("desc"), 2, 1, t, t + 300, abi.encodePacked(r, s, v));
        assertTrue(ok);
        assertEq(reason, 0);

        vm.prank(owner);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.RETIRED, 1, POLICY, EV, "ret");
        assertTrue(reg.getRecord(agentId).retired);
    }

    function test_fork_transferClearsWallet_anyoneSuspends() public {
        uint256 agentId = _newAgent();
        vm.prank(owner);
        reg.register(agentId, controller, POLICY, EV, "reg");
        vm.prank(controller);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "act");

        address buyer = makeAddr("buyer");
        vm.prank(owner);
        ID.transferFrom(owner, buyer, agentId);
        assertEq(ID.getAgentWallet(agentId), address(0), "real registry clears wallet on transfer");

        vm.prank(makeAddr("anyone"));
        reg.flagMismatch(agentId);
        assertEq(uint8(reg.getRecord(agentId).state), uint8(AgentLifecycleRegistry.State.SUSPENDED));
    }

    function test_fork_smartWallet1271() public {
        uint256 signerPk = 0xD00D;
        SimpleSmartWallet sw = new SimpleSmartWallet(vm.addr(signerPk));
        vm.prank(owner);
        uint256 agentId = ID.register("data:application/json;base64,e30=");
        uint256 deadline = block.timestamp + 240;
        bytes memory wsig = _walletSig(agentId, address(sw), owner, deadline, signerPk);
        vm.prank(owner);
        ID.setAgentWallet(agentId, address(sw), deadline, wsig);
        assertEq(ID.getAgentWallet(agentId), address(sw));

        vm.prank(owner);
        reg.register(agentId, controller, POLICY, EV, "reg");
        uint256 t = block.timestamp;
        bytes32 d = reg.handshakeDigest(agentId, "https://c.example", keccak256("n"), keccak256("d"), 1, 0, t, t + 60);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, d);
        (bool ok,) = reg.verifyHandshake(agentId, "https://c.example", keccak256("n"), keccak256("d"), 1, 0, t, t + 60, abi.encodePacked(r, s, v));
        assertTrue(ok, "ERC-1271 wallet proof accepted");
    }

    function test_fork_gasCosts() public {
        uint256 agentId = _newAgent();
        vm.prank(owner);
        uint256 g = gasleft();
        reg.register(agentId, controller, POLICY, EV, "reg");
        emit log_named_uint("register gas", g - gasleft());
        vm.prank(controller);
        g = gasleft();
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "act");
        emit log_named_uint("activate gas", g - gasleft());
    }
}
