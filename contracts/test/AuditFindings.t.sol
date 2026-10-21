// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgentLifecycleRegistry, IERC8004Identity} from "../src/AgentLifecycleRegistry.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

/// Regression tests for the internal review findings (F1, F2, F4 fixed; F3 is an upstream limit
/// that clients cover by scanning ERC-8004 Transfer / MetadataSet events, see docs).
contract AuditFindingsTest is Test {
    AgentLifecycleRegistry reg;
    MockIdentityRegistry id;
    address owner = makeAddr("owner");
    address controller = makeAddr("controller");
    address wallet = makeAddr("wallet");
    bytes32 constant POLICY = keccak256("policy-v1");
    bytes32 constant EV = keccak256("ev");
    uint256 agentId;

    function setUp() public {
        id = new MockIdentityRegistry();
        reg = new AgentLifecycleRegistry(IERC8004Identity(address(id)));
        vm.startPrank(owner);
        agentId = id.register();
        id.setAgentWallet(agentId, wallet);
        reg.register(agentId, controller, POLICY, EV, "reg");
        vm.stopPrank();
    }

    /// F1 fixed: a controller cannot jump the epoch toward uint64 max and brick rebind.
    function test_F1_epochJumpRejected() public {
        uint64 step = reg.MAX_EPOCH_STEP();
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.EpochJump.selector, type(uint64).max, 0));
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, type(uint64).max, POLICY, EV, "a");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.EpochJump.selector, step + 1, 0));
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, step + 1, POLICY, EV, "a2");
        vm.prank(controller);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, step, POLICY, EV, "a3");
        vm.prank(owner);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.SUSPENDED, step, POLICY, EV, "s");
        vm.prank(owner);
        reg.rebind(agentId, 3, makeAddr("newController"), POLICY, EV, "rb");
        assertEq(reg.getRecord(agentId).authorityEpoch, step + 1);
    }

    /// F2 fixed: the controller cannot swap the owner-approved policy digest.
    function test_F2_controllerCannotChangePolicy() public {
        bytes32 rogue = keccak256("unlimited-spend");
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.PolicyMismatch.selector);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, rogue, EV, "a");
        // The owner changes policy through rebind (only allowed outside ACTIVE).
        bytes32 p2 = keccak256("policy-v2");
        vm.prank(owner);
        reg.rebind(agentId, 1, controller, p2, EV, "rb");
        vm.prank(controller);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.ACTIVE, 2, p2, EV, "a2");
        assertEq(reg.getRecord(agentId).policyDigest, p2);
    }

    /// F3 (documented limit): owner change A->B->A (wallet re-set to same wallet) while ACTIVE is invisible on chain:
    ///     record stays ACTIVE, operational again, never suspended, no reauthorization.
    function test_F3_roundTripTransferUndetected() public {
        vm.prank(controller);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "a");
        address b = makeAddr("b");
        vm.prank(owner);
        id.transferFrom(owner, b, agentId);
        vm.prank(b);
        id.transferFrom(b, owner, agentId);
        vm.prank(owner);
        id.setAgentWallet(agentId, wallet);
        (AgentLifecycleRegistry.State s,,, bool op) = reg.liveStatus(agentId);
        assertEq(uint8(s), uint8(AgentLifecycleRegistry.State.ACTIVE));
        assertTrue(op, "operational again with no suspension recorded");
        vm.expectRevert(AgentLifecycleRegistry.NothingToFlag.selector);
        reg.flagMismatch(agentId);
    }
}

/// F4 fixed: if the upstream (UUPS) identity registry starts reverting on ownerOf, the controller
///     can still suspend; nothing else moves.
contract BrickedRegistry {
    address public o;
    address public w;
    bool public bricked;

    constructor(address o_, address w_) {
        o = o_;
        w = w_;
    }

    function brick() external {
        bricked = true;
    }

    function ownerOf(uint256) external view returns (address) {
        require(!bricked, "upgraded");
        return o;
    }

    function getAgentWallet(uint256) external view returns (address) {
        return w;
    }
}

contract AuditUpstreamTest is Test {
    function test_F4_controllerSuspendSurvivesUpstreamRevert() public {
        address owner = makeAddr("owner");
        address controller = makeAddr("controller");
        BrickedRegistry br = new BrickedRegistry(owner, makeAddr("wallet"));
        AgentLifecycleRegistry reg = new AgentLifecycleRegistry(IERC8004Identity(address(br)));
        vm.prank(owner);
        reg.register(1, controller, keccak256("p"), keccak256("e"), "r");
        vm.prank(controller);
        reg.transition(1, 1, AgentLifecycleRegistry.State.ACTIVE, 1, keccak256("p"), keccak256("e"), "a");
        br.brick();
        vm.prank(controller);
        reg.transition(1, 2, AgentLifecycleRegistry.State.SUSPENDED, 1, keccak256("p"), keccak256("e"), "s");
        assertEq(uint8(reg.getRecord(1).state), uint8(AgentLifecycleRegistry.State.SUSPENDED));
        // Frozen: no retire or resume by the controller while ownership cannot be read.
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.ControllerFrozen.selector);
        reg.transition(1, 3, AgentLifecycleRegistry.State.RETIRED, 1, keccak256("p"), keccak256("e"), "r");
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.Unauthorized.selector);
        reg.transition(1, 3, AgentLifecycleRegistry.State.RETIRED, 1, keccak256("p"), keccak256("e"), "r2");
    }
}
