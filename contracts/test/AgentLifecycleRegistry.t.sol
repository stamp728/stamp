// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {AgentLifecycleRegistry, IERC8004Identity} from "../src/AgentLifecycleRegistry.sol";
import {MockIdentityRegistry} from "./mocks/MockIdentityRegistry.sol";

contract AgentLifecycleRegistryTest is Test {
    AgentLifecycleRegistry reg;
    MockIdentityRegistry id;

    address owner = makeAddr("owner");
    address controller = makeAddr("controller");
    address stranger = makeAddr("stranger");
    address buyer = makeAddr("buyer");
    uint256 walletPk = 0xA11CE;
    address wallet;

    bytes32 constant POLICY = keccak256("policy-v1");
    bytes32 constant EV = keccak256("evidence");
    uint256 agentId;

    function setUp() public {
        id = new MockIdentityRegistry();
        reg = new AgentLifecycleRegistry(IERC8004Identity(address(id)));
        wallet = vm.addr(walletPk);
        vm.prank(owner);
        agentId = id.register();
        vm.prank(owner);
        id.setAgentWallet(agentId, wallet);
    }

    // ---------------------------------------------------------------- helpers

    function _register() internal returns (uint64) {
        vm.prank(owner);
        return reg.register(agentId, controller, POLICY, EV, "op-register");
    }

    function _move(address who, AgentLifecycleRegistry.State to, uint64 epoch, bytes32 op) internal returns (uint64) {
        AgentLifecycleRegistry.Record memory r = reg.getRecord(agentId);
        vm.prank(who);
        return reg.transition(agentId, r.sequence, to, epoch, r.policyDigest, EV, op);
    }

    function _activate(uint64 epoch, bytes32 op) internal returns (uint64) {
        return _move(controller, AgentLifecycleRegistry.State.ACTIVE, epoch, op);
    }

    function _state() internal view returns (AgentLifecycleRegistry.State) {
        return reg.getRecord(agentId).state;
    }

    // ---------------------------------------------------------------- constructor

    function test_constructorRejectsEOA() public {
        vm.expectRevert(AgentLifecycleRegistry.ZeroValue.selector);
        new AgentLifecycleRegistry(IERC8004Identity(stranger));
    }

    // ---------------------------------------------------------------- CORE-01 / CORE-02 registration

    function test_register_recordsSnapshots() public {
        assertEq(_register(), 1);
        AgentLifecycleRegistry.Record memory r = reg.getRecord(agentId);
        assertEq(uint8(r.state), uint8(AgentLifecycleRegistry.State.REGISTERED));
        assertEq(r.sequence, 1);
        assertEq(r.controller, controller);
        assertEq(r.ownerSnapshot, owner);
        assertEq(r.walletSnapshot, wallet, "read-back wallet equals dedicated wallet");
        assertEq(r.authorityEpoch, 0);
        assertEq(r.policyDigest, POLICY);
        assertFalse(r.retired);
    }

    function test_register_onlyOnce() public {
        _register();
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.AlreadyRecorded.selector);
        reg.register(agentId, controller, POLICY, EV, "op-register-2");
    }

    function test_register_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(AgentLifecycleRegistry.NotOwner.selector);
        reg.register(agentId, controller, POLICY, EV, "op");
    }

    function test_register_rejectsOwnerAsWallet() public {
        vm.prank(owner);
        uint256 id2 = id.register(); // registry default: wallet = owner
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.DedicatedWalletRequired.selector);
        reg.register(id2, controller, POLICY, EV, "op");
    }

    function test_register_rejectsUnsetWallet() public {
        vm.prank(owner);
        id.unsetAgentWallet(agentId);
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.WalletUnset.selector);
        reg.register(agentId, controller, POLICY, EV, "op");
    }

    function test_register_rejectsBadController() public {
        vm.startPrank(owner);
        vm.expectRevert(AgentLifecycleRegistry.InvalidController.selector);
        reg.register(agentId, address(0), POLICY, EV, "op");
        vm.expectRevert(AgentLifecycleRegistry.InvalidController.selector);
        reg.register(agentId, wallet, POLICY, EV, "op2");
        vm.stopPrank();
    }

    function test_register_rejectsZeroCommitments() public {
        vm.startPrank(owner);
        vm.expectRevert(AgentLifecycleRegistry.ZeroValue.selector);
        reg.register(agentId, controller, bytes32(0), EV, "op");
        vm.expectRevert(AgentLifecycleRegistry.ZeroValue.selector);
        reg.register(agentId, controller, POLICY, bytes32(0), "op");
        vm.expectRevert(AgentLifecycleRegistry.ZeroValue.selector);
        reg.register(agentId, controller, POLICY, EV, bytes32(0));
        vm.stopPrank();
    }

    function test_register_unknownAgentReverts() public {
        vm.prank(owner);
        vm.expectRevert();
        reg.register(999, controller, POLICY, EV, "op");
    }

    function test_register_emitsTransition() public {
        vm.expectEmit(true, true, true, true, address(reg));
        emit AgentLifecycleRegistry.Transition(
            agentId,
            AgentLifecycleRegistry.State.NONE,
            AgentLifecycleRegistry.State.REGISTERED,
            1,
            EV,
            owner,
            controller,
            0,
            POLICY,
            "op-register",
            0,
            block.number,
            block.timestamp
        );
        _register();
    }

    function test_enumeration() public {
        assertEq(reg.agentCount(), 0);
        _register();
        vm.prank(owner);
        uint256 id2 = id.register();
        vm.prank(owner);
        id.setAgentWallet(id2, makeAddr("w2"));
        vm.prank(owner);
        reg.register(id2, controller, POLICY, EV, "op-2");
        assertEq(reg.agentCount(), 2);
        uint256[] memory ids = reg.agentIds(0, 10);
        assertEq(ids.length, 2);
        assertEq(ids[0], agentId);
        assertEq(ids[1], id2);
        assertEq(reg.agentIds(1, 1)[0], id2);
        assertEq(reg.agentIds(5, 1).length, 0);
    }

    function test_previousBlockChain() public {
        vm.roll(100);
        _register();
        vm.roll(250);
        vm.recordLogs();
        _activate(1, "a");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        (,,,,,,, uint64 previousBlock, uint256 blockNumber,) =
            abi.decode(logs[0].data, (uint8, uint8, bytes32, address, uint64, bytes32, bytes32, uint64, uint256, uint256));
        assertEq(previousBlock, 100);
        assertEq(blockNumber, 250);
        assertEq(reg.getRecord(agentId).updatedAtBlock, 250);
    }

    // ---------------------------------------------------------------- edges and roles

    function test_activateSuspendResumeRetire() public {
        _register();
        assertEq(_activate(1, "a1"), 2);
        assertEq(uint8(_state()), uint8(AgentLifecycleRegistry.State.ACTIVE));
        assertEq(_move(controller, AgentLifecycleRegistry.State.SUSPENDED, 1, "s1"), 3);
        assertEq(_activate(2, "a2"), 4);
        assertEq(_move(controller, AgentLifecycleRegistry.State.RETIRED, 2, "r1"), 5);
        AgentLifecycleRegistry.Record memory r = reg.getRecord(agentId);
        assertTrue(r.retired);
        assertEq(r.authorityEpoch, 2);
    }

    function test_registeredCanBeAbandoned() public {
        _register();
        _move(owner, AgentLifecycleRegistry.State.RETIRED, 0, "r");
        assertTrue(reg.getRecord(agentId).retired);
    }

    function test_registeredCanBeSuspended() public {
        _register();
        _move(owner, AgentLifecycleRegistry.State.SUSPENDED, 0, "s");
        assertEq(uint8(_state()), uint8(AgentLifecycleRegistry.State.SUSPENDED));
    }

    function test_invalidEdges() public {
        _register();
        AgentLifecycleRegistry.State[3] memory bad = [
            AgentLifecycleRegistry.State.REGISTERED,
            AgentLifecycleRegistry.State.DRAFT,
            AgentLifecycleRegistry.State.PROVISIONED
        ];
        for (uint256 i; i < bad.length; i++) {
            vm.prank(controller);
            vm.expectRevert(
                abi.encodeWithSelector(AgentLifecycleRegistry.InvalidEdge.selector, AgentLifecycleRegistry.State.REGISTERED, bad[i])
            );
            reg.transition(agentId, 1, bad[i], 0, POLICY, EV, keccak256(abi.encode(i)));
        }
        _activate(1, "a");
        vm.prank(controller);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentLifecycleRegistry.InvalidEdge.selector, AgentLifecycleRegistry.State.ACTIVE, AgentLifecycleRegistry.State.ACTIVE
            )
        );
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.ACTIVE, 2, POLICY, EV, "aa");
    }

    function test_ownerCannotActivate() public {
        _register();
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.Unauthorized.selector);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "a");
    }

    function test_strangerCannotMove() public {
        _register();
        AgentLifecycleRegistry.State[3] memory targets =
            [AgentLifecycleRegistry.State.ACTIVE, AgentLifecycleRegistry.State.SUSPENDED, AgentLifecycleRegistry.State.RETIRED];
        for (uint256 i; i < 3; i++) {
            uint64 epoch = targets[i] == AgentLifecycleRegistry.State.ACTIVE ? 1 : 0;
            vm.prank(stranger);
            vm.expectRevert(AgentLifecycleRegistry.Unauthorized.selector);
            reg.transition(agentId, 1, targets[i], epoch, POLICY, EV, keccak256(abi.encode(i)));
        }
    }

    function test_agentWalletCannotMove() public {
        _register();
        vm.prank(wallet);
        vm.expectRevert(AgentLifecycleRegistry.Unauthorized.selector);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "a");
    }

    function test_ownerCanSuspendAndRetireDirectly() public {
        _register();
        _activate(1, "a");
        _move(owner, AgentLifecycleRegistry.State.SUSPENDED, 1, "s");
        _move(owner, AgentLifecycleRegistry.State.RETIRED, 1, "r");
        assertTrue(reg.getRecord(agentId).retired);
    }

    // ---------------------------------------------------------------- epochs, policy, sequence

    function test_activationNeedsFreshEpoch() public {
        _register();
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.StaleEpoch.selector, 0, 0));
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 0, POLICY, EV, "a");
        _activate(5, "a5");
        _move(controller, AgentLifecycleRegistry.State.SUSPENDED, 5, "s");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.StaleEpoch.selector, 5, 5));
        reg.transition(agentId, 3, AgentLifecycleRegistry.State.ACTIVE, 5, POLICY, EV, "a-again");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.StaleEpoch.selector, 4, 5));
        reg.transition(agentId, 3, AgentLifecycleRegistry.State.ACTIVE, 4, POLICY, EV, "a-older");
    }

    function test_nonActivationMustMatchEpoch() public {
        _register();
        _activate(3, "a");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.StaleEpoch.selector, 2, 3));
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.SUSPENDED, 2, POLICY, EV, "s");
    }

    function test_policyChangesOnlyThroughOwnerRebind() public {
        _register();
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.PolicyMismatch.selector);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.SUSPENDED, 0, keccak256("other"), EV, "s");
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.PolicyMismatch.selector);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, keccak256("other"), EV, "a");

        bytes32 p2 = keccak256("policy-v2");
        vm.prank(owner);
        reg.rebind(agentId, 1, controller, p2, EV, "rb");
        vm.prank(controller);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.ACTIVE, 2, p2, EV, "a");
        assertEq(reg.getRecord(agentId).policyDigest, p2);
    }

    function test_staleSequenceRejected() public {
        _register();
        _activate(1, "a");
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.StaleSequence.selector, 1, 2));
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.SUSPENDED, 1, POLICY, EV, "s");
    }

    function test_unrecordedReverts() public {
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.NotRecorded.selector);
        reg.transition(agentId, 0, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "a");
    }

    // ---------------------------------------------------------------- CORE-06 idempotency

    function test_idempotentRetryReturnsOriginal() public {
        _register();
        assertEq(_activate(1, "op-a"), 2);
        // Same id, identical request (expected sequence 1 is now stale, but it is a replay).
        vm.prank(controller);
        uint64 again = reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "op-a");
        assertEq(again, 2);
        assertEq(reg.getRecord(agentId).sequence, 2, "no second effect");
    }

    function test_idempotencyConflictOnChangedRequest() public {
        _register();
        _activate(1, "op-a");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.IdempotencyConflict.selector, bytes32("op-a")));
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 2, POLICY, EV, "op-a");
    }

    function test_registerRetryIsIdempotent() public {
        assertEq(_register(), 1);
        vm.prank(owner);
        assertEq(reg.register(agentId, controller, POLICY, EV, "op-register"), 1);
    }

    function test_operationIdsAreNamespacedByCaller() public {
        _register();
        // A stranger burns "op-a" first under their own namespace; controller is unaffected.
        vm.prank(stranger);
        vm.expectRevert(AgentLifecycleRegistry.Unauthorized.selector);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "op-a");
        assertEq(_activate(1, "op-a"), 2);
        assertEq(reg.getOperation(controller, "op-a").resultSequence, 2);
        assertEq(reg.getOperation(stranger, "op-a").resultSequence, 0);
    }

    function test_competingSequenceLoses() public {
        _register();
        _activate(1, "a");
        // Owner and controller both read sequence 2 and race.
        vm.prank(owner);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.SUSPENDED, 1, POLICY, EV, "owner-s");
        vm.prank(controller);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.StaleSequence.selector, 2, 3));
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.RETIRED, 1, POLICY, EV, "ctl-r");
    }

    // ---------------------------------------------------------------- CORE-08 retirement is terminal

    function test_retiredIsTerminal() public {
        _register();
        _activate(1, "a");
        _move(owner, AgentLifecycleRegistry.State.RETIRED, 1, "r");
        AgentLifecycleRegistry.State[3] memory targets =
            [AgentLifecycleRegistry.State.ACTIVE, AgentLifecycleRegistry.State.SUSPENDED, AgentLifecycleRegistry.State.RETIRED];
        for (uint256 i; i < 3; i++) {
            vm.prank(controller);
            vm.expectRevert(AgentLifecycleRegistry.RetiredIsTerminal.selector);
            reg.transition(agentId, 3, targets[i], 2, POLICY, EV, keccak256(abi.encode("x", i)));
        }
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.RetiredIsTerminal.selector);
        reg.rebind(agentId, 3, stranger, POLICY, EV, "rb");
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.AlreadyRecorded.selector);
        reg.register(agentId, controller, POLICY, EV, "re-register");
    }

    function test_retiredSurvivesOwnershipTransfer() public {
        _register();
        _move(owner, AgentLifecycleRegistry.State.RETIRED, 0, "r");
        vm.prank(owner);
        id.transferFrom(owner, buyer, agentId);
        vm.prank(buyer);
        id.setAgentWallet(agentId, makeAddr("w2"));
        vm.prank(buyer);
        vm.expectRevert(AgentLifecycleRegistry.RetiredIsTerminal.selector);
        reg.rebind(agentId, 2, makeAddr("c2"), POLICY, EV, "rb");
        vm.prank(buyer);
        vm.expectRevert(AgentLifecycleRegistry.AlreadyRecorded.selector);
        reg.register(agentId, makeAddr("c2"), POLICY, EV, "rr");
        vm.expectRevert(AgentLifecycleRegistry.NothingToFlag.selector);
        reg.flagMismatch(agentId);
        (AgentLifecycleRegistry.State s,,, bool op) = reg.liveStatus(agentId);
        assertEq(uint8(s), uint8(AgentLifecycleRegistry.State.RETIRED));
        assertFalse(op);
    }

    // ---------------------------------------------------------------- CORE-09 owner / wallet change

    function test_ownerTransferWhileActive_anyoneSuspends_controllerFrozen() public {
        _register();
        _activate(1, "a");
        vm.prank(owner);
        id.transferFrom(owner, buyer, agentId); // also clears agentWallet

        (,,, bool operational) = reg.liveStatus(agentId);
        assertFalse(operational, "not operational after transfer");

        // Controller is frozen for everything except suspension.
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.ControllerFrozen.selector);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.RETIRED, 1, POLICY, EV, "r");

        vm.prank(stranger);
        assertEq(reg.flagMismatch(agentId), 3);
        assertEq(uint8(_state()), uint8(AgentLifecycleRegistry.State.SUSPENDED));

        vm.expectRevert(AgentLifecycleRegistry.NothingToFlag.selector);
        reg.flagMismatch(agentId);

        // Old controller cannot resume, even with a new epoch.
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.ControllerFrozen.selector);
        reg.transition(agentId, 3, AgentLifecycleRegistry.State.ACTIVE, 2, POLICY, EV, "a2");

        // New owner binds a fresh wallet and controller, then the new controller resumes.
        address w2 = makeAddr("w2");
        address c2 = makeAddr("c2");
        vm.prank(buyer);
        id.setAgentWallet(agentId, w2);
        bytes32 p2 = keccak256("policy-buyer");
        vm.prank(buyer);
        assertEq(reg.rebind(agentId, 3, c2, p2, EV, "rb"), 4);
        AgentLifecycleRegistry.Record memory r = reg.getRecord(agentId);
        assertEq(r.ownerSnapshot, buyer);
        assertEq(r.walletSnapshot, w2);
        assertEq(r.controller, c2);
        assertEq(r.authorityEpoch, 2, "rebind bumps epoch");

        vm.prank(c2);
        vm.expectRevert(abi.encodeWithSelector(AgentLifecycleRegistry.StaleEpoch.selector, 2, 2));
        reg.transition(agentId, 4, AgentLifecycleRegistry.State.ACTIVE, 2, p2, EV, "a3");
        vm.prank(c2);
        reg.transition(agentId, 4, AgentLifecycleRegistry.State.ACTIVE, 3, p2, EV, "a3");
        (,,, operational) = reg.liveStatus(agentId);
        assertTrue(operational);
    }

    function test_controllerCanStillSuspendAfterOwnerChange() public {
        _register();
        _activate(1, "a");
        vm.prank(owner);
        id.transferFrom(owner, buyer, agentId);
        vm.prank(controller);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.SUSPENDED, 1, POLICY, EV, "s");
        assertEq(uint8(_state()), uint8(AgentLifecycleRegistry.State.SUSPENDED));
    }

    function test_newOwnerCanRetireDirectly() public {
        _register();
        _activate(1, "a");
        vm.prank(owner);
        id.transferFrom(owner, buyer, agentId);
        vm.prank(buyer);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.RETIRED, 1, POLICY, EV, "r");
        assertTrue(reg.getRecord(agentId).retired);
    }

    function test_oldOwnerLosesAuthority() public {
        _register();
        vm.prank(owner);
        id.transferFrom(owner, buyer, agentId);
        vm.prank(owner);
        vm.expectRevert(AgentLifecycleRegistry.Unauthorized.selector);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.SUSPENDED, 0, POLICY, EV, "s");
    }

    function test_walletChangeBlocksActivation_andIsFlaggable() public {
        _register();
        vm.prank(owner);
        id.setAgentWallet(agentId, makeAddr("other-wallet"));
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.BindingChanged.selector);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.ACTIVE, 1, POLICY, EV, "a");
        reg.flagMismatch(agentId);
        assertEq(uint8(_state()), uint8(AgentLifecycleRegistry.State.SUSPENDED));
    }

    function test_walletUnsetWhileActive_flaggable() public {
        _register();
        _activate(1, "a");
        vm.prank(owner);
        id.unsetAgentWallet(agentId);
        (, bool om, bool wm, bool op) = reg.liveStatus(agentId);
        assertTrue(om);
        assertFalse(wm);
        assertFalse(op);
        vm.prank(stranger);
        reg.flagMismatch(agentId);
        assertEq(uint8(_state()), uint8(AgentLifecycleRegistry.State.SUSPENDED));
    }

    function test_flagRejectedWhenBindingIntact() public {
        _register();
        vm.expectRevert(AgentLifecycleRegistry.NothingToFlag.selector);
        reg.flagMismatch(agentId);
        vm.expectRevert(AgentLifecycleRegistry.NothingToFlag.selector);
        reg.flagMismatch(12345);
    }

    function test_rebindRequiresSuspensionFirst() public {
        _register();
        _activate(1, "a");
        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                AgentLifecycleRegistry.InvalidEdge.selector, AgentLifecycleRegistry.State.ACTIVE, AgentLifecycleRegistry.State.ACTIVE
            )
        );
        reg.rebind(agentId, 2, makeAddr("c2"), POLICY, EV, "rb");
    }

    function test_rebindOnlyOwner() public {
        _register();
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.NotOwner.selector);
        reg.rebind(agentId, 1, makeAddr("c2"), POLICY, EV, "rb");
    }

    function test_rebindReplacesControllerAndInvalidatesOldOne() public {
        _register();
        address c2 = makeAddr("c2");
        vm.prank(owner);
        reg.rebind(agentId, 1, c2, POLICY, EV, "rb");
        vm.prank(controller);
        vm.expectRevert(AgentLifecycleRegistry.Unauthorized.selector);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.ACTIVE, 2, POLICY, EV, "a");
        vm.prank(c2);
        reg.transition(agentId, 2, AgentLifecycleRegistry.State.ACTIVE, 2, POLICY, EV, "a");
    }

    // ---------------------------------------------------------------- DISC-01 / DISC-02 handshake

    struct HS {
        string audience;
        bytes32 nonce;
        bytes32 descriptorDigest;
        uint256 seq;
        uint256 epoch;
        uint256 issuedAt;
        uint256 expiresAt;
    }

    function _hs() internal view returns (HS memory h) {
        AgentLifecycleRegistry.Record memory r = reg.getRecord(agentId);
        h = HS("https://client.example", keccak256("nonce"), keccak256("descriptor"), r.sequence, r.authorityEpoch, block.timestamp, block.timestamp + 300);
    }

    function _sign(uint256 pk, HS memory h) internal view returns (bytes memory) {
        bytes32 d = reg.handshakeDigest(agentId, h.audience, h.nonce, h.descriptorDigest, h.seq, h.epoch, h.issuedAt, h.expiresAt);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, d);
        return abi.encodePacked(r, s, v);
    }

    function _verify(HS memory h, bytes memory sig) internal view returns (bool, uint8) {
        return reg.verifyHandshake(agentId, h.audience, h.nonce, h.descriptorDigest, h.seq, h.epoch, h.issuedAt, h.expiresAt, sig);
    }

    function test_handshake_valid() public {
        vm.warp(1_800_000_000);
        _register();
        _activate(1, "a");
        HS memory h = _hs();
        (bool ok, uint8 reason) = _verify(h, _sign(walletPk, h));
        assertTrue(ok);
        assertEq(reason, 0);
    }

    function test_handshake_7702DelegatedEOA() public {
        vm.warp(1_800_000_000);
        _register();
        // BEP-441 / EIP-7702 delegation designator: the EOA now has code but still signs with its key.
        vm.etch(wallet, abi.encodePacked(hex"ef0100", makeAddr("delegate")));
        HS memory h = _hs();
        (bool ok, uint8 reason) = _verify(h, _sign(walletPk, h));
        assertTrue(ok);
        assertEq(reason, 0);
    }

    function test_handshake_digestMatchesManualEIP712() public {
        _register();
        HS memory h = _hs();
        bytes32 structHash = keccak256(
            abi.encode(
                reg.HANDSHAKE_TYPEHASH(),
                keccak256(bytes(reg.agentRegistry())),
                keccak256(bytes(vm.toString(agentId))),
                keccak256(bytes(h.audience)),
                h.nonce,
                h.descriptorDigest,
                h.seq,
                h.epoch,
                h.issuedAt,
                h.expiresAt
            )
        );
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Agent Lifecycle Protocol"),
                keccak256("0.4"),
                block.chainid,
                address(reg)
            )
        );
        assertEq(
            reg.handshakeDigest(agentId, h.audience, h.nonce, h.descriptorDigest, h.seq, h.epoch, h.issuedAt, h.expiresAt),
            keccak256(abi.encodePacked("\x19\x01", domain, structHash))
        );
    }

    function test_agentRegistryString() public view {
        assertEq(reg.agentRegistry(), string.concat("eip155:", vm.toString(block.chainid), ":", _lower(address(id))));
    }

    function test_handshake_rejections() public {
        vm.warp(1_800_000_000);
        _register();
        _activate(1, "a");
        HS memory h = _hs();
        bytes memory sig = _sign(walletPk, h);

        // wrong signer (owner key is not the agent wallet)
        (bool ok, uint8 reason) = _verify(h, _sign(0xB0B, h));
        assertFalse(ok);
        assertEq(reason, 8);

        // altered audience / descriptor / nonce under the same signature
        HS memory h2 = _hs();
        h2.audience = "https://evil.example";
        (ok, reason) = _verify(h2, sig);
        assertEq(reason, 8);
        h2 = _hs();
        h2.descriptorDigest = keccak256("changed");
        (ok, reason) = _verify(h2, sig);
        assertEq(reason, 8);
        h2 = _hs();
        h2.nonce = keccak256("other");
        (ok, reason) = _verify(h2, sig);
        assertEq(reason, 8);

        // TTL above 300s
        h2 = _hs();
        h2.expiresAt = h2.issuedAt + 301;
        (ok, reason) = _verify(h2, _sign(walletPk, h2));
        assertEq(reason, 7);

        // issued slightly ahead of the last block (wall clock vs block time): accepted
        h2 = _hs();
        h2.issuedAt = block.timestamp + 30;
        h2.expiresAt = h2.issuedAt + 100;
        (ok, reason) = _verify(h2, _sign(walletPk, h2));
        assertEq(reason, 0);

        // issued too far in the future
        h2 = _hs();
        h2.issuedAt = block.timestamp + 31;
        h2.expiresAt = h2.issuedAt + 100;
        (ok, reason) = _verify(h2, _sign(walletPk, h2));
        assertEq(reason, 7);

        // expired
        vm.warp(block.timestamp + 301);
        (ok, reason) = _verify(h, sig);
        assertEq(reason, 7);
    }

    function test_handshake_staleAfterLifecycleChange() public {
        vm.warp(1_800_000_000);
        _register();
        _activate(1, "a");
        HS memory h = _hs();
        bytes memory sig = _sign(walletPk, h);
        _move(controller, AgentLifecycleRegistry.State.SUSPENDED, 1, "s");
        (bool ok, uint8 reason) = _verify(h, sig);
        assertFalse(ok);
        assertEq(reason, 5, "stale sequence");

        _activate(2, "a2");
        h = _hs();
        h.epoch = 1;
        (ok, reason) = _verify(h, _sign(walletPk, h));
        assertEq(reason, 6, "stale epoch");
    }

    function test_handshake_ownershipAndRetirement() public {
        vm.warp(1_800_000_000);
        _register();
        HS memory h = _hs();
        bytes memory sig = _sign(walletPk, h);
        vm.prank(owner);
        id.transferFrom(owner, buyer, agentId);
        (bool ok, uint8 reason) = _verify(h, sig);
        assertFalse(ok);
        assertEq(reason, 3);

        (ok, reason) = reg.verifyHandshake(777, h.audience, h.nonce, h.descriptorDigest, 1, 0, h.issuedAt, h.expiresAt, sig);
        assertEq(reason, 1);

        vm.prank(buyer);
        reg.transition(agentId, 1, AgentLifecycleRegistry.State.RETIRED, 0, POLICY, EV, "r");
        (ok, reason) = _verify(h, sig);
        assertEq(reason, 2);
    }

    // ---------------------------------------------------------------- fuzz: invariants under random actions

    function testFuzz_randomWalkKeepsInvariants(uint8[24] calldata actions) public {
        _register();
        uint64 lastSeq = 1;
        uint64 lastEpoch = 0;
        bool wasRetired;
        for (uint256 i; i < actions.length; i++) {
            AgentLifecycleRegistry.Record memory r = reg.getRecord(agentId);
            uint8 a = actions[i] % 6;
            address who = a % 2 == 0 ? controller : owner;
            AgentLifecycleRegistry.State to = a < 2
                ? AgentLifecycleRegistry.State.ACTIVE
                : (a < 4 ? AgentLifecycleRegistry.State.SUSPENDED : AgentLifecycleRegistry.State.RETIRED);
            uint64 epoch = to == AgentLifecycleRegistry.State.ACTIVE ? r.authorityEpoch + 1 : r.authorityEpoch;
            vm.prank(who);
            try reg.transition(agentId, r.sequence, to, epoch, r.policyDigest, EV, keccak256(abi.encode(i, a))) {} catch {}

            AgentLifecycleRegistry.Record memory n = reg.getRecord(agentId);
            assertGe(n.sequence, lastSeq, "sequence monotonic");
            assertGe(n.authorityEpoch, lastEpoch, "epoch monotonic");
            if (wasRetired) {
                assertTrue(n.retired);
                assertEq(uint8(n.state), uint8(AgentLifecycleRegistry.State.RETIRED));
                assertEq(n.sequence, lastSeq, "retired never changes");
            }
            assertEq(n.retired, n.state == AgentLifecycleRegistry.State.RETIRED);
            lastSeq = n.sequence;
            lastEpoch = n.authorityEpoch;
            wasRetired = n.retired;
        }
    }

    function _lower(address a) internal pure returns (string memory) {
        bytes memory s = bytes(vm.toString(a));
        for (uint256 i = 2; i < s.length; i++) {
            if (s[i] >= "A" && s[i] <= "Z") s[i] = bytes1(uint8(s[i]) + 32);
        }
        return string(s);
    }
}
