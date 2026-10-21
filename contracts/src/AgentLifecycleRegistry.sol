// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice The two ERC-8004 identity-registry reads this contract depends on.
interface IERC8004Identity {
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/// @title  AgentLifecycleRegistry
/// @notice BAP-728 section 4.4 lifecycle registry for ERC-8004 agents on BNB Smart Chain.
///
///         One record per (chainId, identityRegistry, agentId). The record starts at REGISTERED,
///         moves only along the ALP v0.4 edges, uses expected-sequence compare-and-set, and a
///         RETIRED record can never change again.
///
///         Trust model, stated plainly:
///         - No owner, no admin, no proxy, no pause, no upgrade. Nobody can rewrite a record
///           outside the rules below, including the deployer. Retirement is therefore permanent.
///         - The contract checks WHO may move a record and WHETHER the edge is legal. It cannot
///           check that off-chain evidence (a payment receipt, a runtime lease) is true. Every
///           transition carries an evidence commitment that clients verify under their own policy.
contract AgentLifecycleRegistry is EIP712 {
    // ---------------------------------------------------------------- types

    /// @dev Numbering follows ALP v0.4 section 2.1. DRAFT and PROVISIONED are local states and
    ///      never appear on chain; NONE means "no record".
    enum State {
        NONE,
        DRAFT,
        PROVISIONED,
        REGISTERED,
        ACTIVE,
        SUSPENDED,
        RETIRED
    }

    struct Record {
        // slot 0
        address controller;
        uint64 sequence;
        State state;
        bool retired;
        // slot 1
        address ownerSnapshot;
        uint64 authorityEpoch;
        // slot 2
        address walletSnapshot;
        uint64 updatedAtBlock;
        // slot 3
        bytes32 evidence;
        // slot 4
        bytes32 policyDigest;
    }

    struct Operation {
        bytes32 requestHash;
        uint64 resultSequence;
    }

    // ---------------------------------------------------------------- constants

    string public constant ALP_VERSION = "0.4-draft";

    bytes32 public constant HANDSHAKE_TYPEHASH = keccak256(
        "ALPHandshake(string agentRegistry,string agentId,string audience,bytes32 nonce,bytes32 descriptorDigest,uint256 lifecycleSequence,uint256 authorityEpoch,uint256 issuedAt,uint256 expiresAt)"
    );

    uint256 public constant MAX_HANDSHAKE_TTL = 300;

    /// @notice A handshake may be stamped up to this many seconds after the latest block, because
    ///         an eth_call runs against the last mined block while the signer uses wall-clock time.
    uint256 public constant MAX_CLOCK_SKEW = 30;

    /// @notice Largest allowed jump of the authority epoch in one activation. Keeps the epoch far
    ///         from uint64 max so a rogue controller cannot exhaust it and block `rebind`.
    uint64 public constant MAX_EPOCH_STEP = 1_000_000;

    /// @notice The single ERC-8004 identity registry this lifecycle trust domain is pinned to.
    IERC8004Identity public immutable IDENTITY_REGISTRY;

    // ---------------------------------------------------------------- storage

    mapping(uint256 agentId => Record) private _records;
    /// @dev Every agentId ever recorded, in registration order. Lets any client list the
    ///      registry straight from chain state, no indexer needed.
    uint256[] private _agentIds;
    /// @dev Keyed by keccak256(caller, operationId) so one caller cannot poison another's ids.
    mapping(bytes32 operationKey => Operation) private _operations;

    // ---------------------------------------------------------------- events

    /// @notice Every record change, including first registration (from = NONE).
    event Transition(
        uint256 indexed agentId,
        State from,
        State to,
        uint64 indexed sequence,
        bytes32 evidence,
        address indexed actor,
        address controller,
        uint64 authorityEpoch,
        bytes32 policyDigest,
        bytes32 operationId,
        uint64 previousBlock,
        uint256 blockNumber,
        uint256 timestamp
    );

    /// @notice Owner re-established authority: new snapshots, new controller, epoch bumped.
    event Rebound(
        uint256 indexed agentId,
        uint64 indexed sequence,
        address owner,
        address wallet,
        address controller,
        uint64 authorityEpoch,
        bytes32 policyDigest,
        bytes32 evidence
    );

    // ---------------------------------------------------------------- errors

    error AlreadyRecorded();
    error NotRecorded();
    error RetiredIsTerminal();
    error NotOwner();
    error Unauthorized();
    error ControllerFrozen();
    error InvalidEdge(State from, State to);
    error StaleSequence(uint64 expected, uint64 current);
    error StaleEpoch(uint64 given, uint64 current);
    error EpochJump(uint64 given, uint64 current);
    error PolicyMismatch();
    error WalletUnset();
    error DedicatedWalletRequired();
    error BindingChanged();
    error ZeroValue();
    error InvalidController();
    error IdempotencyConflict(bytes32 operationId);
    error NothingToFlag();

    // ---------------------------------------------------------------- constructor

    constructor(IERC8004Identity identityRegistry) EIP712("Agent Lifecycle Protocol", "0.4") {
        if (address(identityRegistry).code.length == 0) revert ZeroValue();
        IDENTITY_REGISTRY = identityRegistry;
    }

    // ---------------------------------------------------------------- writes

    /// @notice First registration (PROVISIONED -> REGISTERED in ALP terms). Only the current
    ///         ERC-8004 owner, with a verified agent wallet that is not the owner itself.
    function register(
        uint256 agentId,
        address controller,
        bytes32 policyDigest,
        bytes32 evidence,
        bytes32 operationId
    ) external returns (uint64) {
        bytes32 requestHash = keccak256(abi.encode(this.register.selector, agentId, controller, policyDigest, evidence, msg.sender));
        (bool replay, uint64 prior) = _checkOperation(operationId, requestHash);
        if (replay) return prior;

        Record storage r = _records[agentId];
        if (r.state != State.NONE) revert AlreadyRecorded();
        if (policyDigest == bytes32(0) || evidence == bytes32(0)) revert ZeroValue();

        address owner = IDENTITY_REGISTRY.ownerOf(agentId);
        if (msg.sender != owner) revert NotOwner();
        address wallet = IDENTITY_REGISTRY.getAgentWallet(agentId);
        if (wallet == address(0)) revert WalletUnset();
        if (wallet == owner) revert DedicatedWalletRequired();
        if (controller == address(0) || controller == wallet) revert InvalidController();

        _agentIds.push(agentId);
        r.controller = controller;
        r.sequence = 1;
        r.state = State.REGISTERED;
        r.ownerSnapshot = owner;
        r.walletSnapshot = wallet;
        r.updatedAtBlock = uint64(block.number);
        r.evidence = evidence;
        r.policyDigest = policyDigest;

        _operations[_opKey(operationId)] = Operation(requestHash, 1);
        emit Transition(agentId, State.NONE, State.REGISTERED, 1, evidence, msg.sender, controller, 0, policyDigest, operationId, 0, block.number, block.timestamp);
        return 1;
    }

    /// @notice Move a record along a legal ALP edge.
    /// @param expectedSequence Compare-and-set guard: must equal the current sequence.
    /// @param authorityEpoch   For ACTIVE: the newly installed lease epoch, strictly greater than
    ///                         the stored one and at most MAX_EPOCH_STEP above it. For any other
    ///                         target: must equal the stored epoch.
    /// @param policyDigest     Must equal the stored owner-approved digest. Only the owner changes
    ///                         policy, through `rebind`; a controller can never swap it.
    function transition(
        uint256 agentId,
        uint64 expectedSequence,
        State next,
        uint64 authorityEpoch,
        bytes32 policyDigest,
        bytes32 evidence,
        bytes32 operationId
    ) external returns (uint64) {
        bytes32 requestHash = keccak256(
            abi.encode(this.transition.selector, agentId, expectedSequence, next, authorityEpoch, policyDigest, evidence, msg.sender)
        );
        (bool replay, uint64 prior) = _checkOperation(operationId, requestHash);
        if (replay) return prior;

        Record storage r = _records[agentId];
        State from = r.state;
        if (from == State.NONE) revert NotRecorded();
        if (r.retired) revert RetiredIsTerminal();
        if (expectedSequence != r.sequence) revert StaleSequence(expectedSequence, r.sequence);
        if (!_validEdge(from, next)) revert InvalidEdge(from, next);
        if (evidence == bytes32(0) || policyDigest == bytes32(0)) revert ZeroValue();

        if (policyDigest != r.policyDigest) revert PolicyMismatch();

        // try/catch: if the upstream registry ever stops answering ownerOf, safe suspension by the
        // controller must still work (owner reads as zero, controller is frozen to suspend-only).
        address liveOwner = _tryOwnerOf(agentId);
        bool isOwner = liveOwner != address(0) && msg.sender == liveOwner;
        bool isController = msg.sender == r.controller;
        bool frozen = liveOwner != r.ownerSnapshot;

        if (next == State.ACTIVE) {
            // Activation and resume: controller only, with an unchanged binding and a fresh lease.
            if (!isController) revert Unauthorized();
            if (frozen) revert ControllerFrozen();
            address liveWallet = IDENTITY_REGISTRY.getAgentWallet(agentId);
            if (liveWallet == address(0) || liveWallet != r.walletSnapshot) revert BindingChanged();
            if (authorityEpoch <= r.authorityEpoch) revert StaleEpoch(authorityEpoch, r.authorityEpoch);
            if (authorityEpoch - r.authorityEpoch > MAX_EPOCH_STEP) revert EpochJump(authorityEpoch, r.authorityEpoch);
            r.authorityEpoch = authorityEpoch;
        } else {
            if (authorityEpoch != r.authorityEpoch) revert StaleEpoch(authorityEpoch, r.authorityEpoch);
            if (next == State.SUSPENDED) {
                // Safe suspension stays open to the controller even after an owner change.
                if (!isOwner && !isController) revert Unauthorized();
            } else {
                // RETIRED
                if (!isOwner) {
                    if (!isController) revert Unauthorized();
                    if (frozen) revert ControllerFrozen();
                }
                r.retired = true;
            }
        }

        uint64 seq = r.sequence + 1;
        uint64 prevBlock = r.updatedAtBlock;
        r.sequence = seq;
        r.state = next;
        r.evidence = evidence;
        r.updatedAtBlock = uint64(block.number);

        _operations[_opKey(operationId)] = Operation(requestHash, seq);
        emit Transition(
            agentId,
            from,
            next,
            seq,
            evidence,
            msg.sender,
            r.controller,
            r.authorityEpoch,
            r.policyDigest,
            operationId,
            prevBlock,
            block.number,
            block.timestamp
        );
        return seq;
    }

    /// @notice Current owner re-establishes authority after an ownership or wallet change, or
    ///         replaces the controller. Not allowed while ACTIVE: suspend first (BAP-728 4.4).
    ///         Bumps the authority epoch so every lease issued before the rebind is stale.
    function rebind(
        uint256 agentId,
        uint64 expectedSequence,
        address newController,
        bytes32 policyDigest,
        bytes32 evidence,
        bytes32 operationId
    ) external returns (uint64) {
        bytes32 requestHash = keccak256(
            abi.encode(this.rebind.selector, agentId, expectedSequence, newController, policyDigest, evidence, msg.sender)
        );
        (bool replay, uint64 prior) = _checkOperation(operationId, requestHash);
        if (replay) return prior;

        Record storage r = _records[agentId];
        if (r.state == State.NONE) revert NotRecorded();
        if (r.retired) revert RetiredIsTerminal();
        if (r.state == State.ACTIVE) revert InvalidEdge(State.ACTIVE, State.ACTIVE);
        if (expectedSequence != r.sequence) revert StaleSequence(expectedSequence, r.sequence);
        if (evidence == bytes32(0) || policyDigest == bytes32(0)) revert ZeroValue();

        address owner = IDENTITY_REGISTRY.ownerOf(agentId);
        if (msg.sender != owner) revert NotOwner();
        address wallet = IDENTITY_REGISTRY.getAgentWallet(agentId);
        if (wallet == address(0)) revert WalletUnset();
        if (wallet == owner) revert DedicatedWalletRequired();
        if (newController == address(0) || newController == wallet) revert InvalidController();

        uint64 seq = r.sequence + 1;
        uint64 epoch = r.authorityEpoch + 1;
        uint64 prevBlock = r.updatedAtBlock;
        r.sequence = seq;
        r.authorityEpoch = epoch;
        r.controller = newController;
        r.ownerSnapshot = owner;
        r.walletSnapshot = wallet;
        r.policyDigest = policyDigest;
        r.evidence = evidence;
        r.updatedAtBlock = uint64(block.number);

        _operations[_opKey(operationId)] = Operation(requestHash, seq);
        emit Rebound(agentId, seq, owner, wallet, newController, epoch, policyDigest, evidence);
        emit Transition(
            agentId, r.state, r.state, seq, evidence, msg.sender, newController, epoch, policyDigest, operationId, prevBlock, block.number, block.timestamp
        );
        return seq;
    }

    /// @notice Anyone may suspend a record whose on-chain owner or agent wallet no longer matches
    ///         its snapshot (BAP-728 4.4). The evidence commitment is derived on chain.
    function flagMismatch(uint256 agentId) external returns (uint64) {
        Record storage r = _records[agentId];
        State from = r.state;
        if (from != State.REGISTERED && from != State.ACTIVE) revert NothingToFlag();

        address liveOwner = IDENTITY_REGISTRY.ownerOf(agentId);
        address liveWallet = IDENTITY_REGISTRY.getAgentWallet(agentId);
        if (liveOwner == r.ownerSnapshot && liveWallet == r.walletSnapshot) revert NothingToFlag();

        bytes32 evidence = keccak256(
            abi.encode("ALP:BINDING_MISMATCH", block.chainid, agentId, r.ownerSnapshot, r.walletSnapshot, liveOwner, liveWallet, block.number)
        );
        uint64 seq = r.sequence + 1;
        uint64 prevBlock = r.updatedAtBlock;
        r.sequence = seq;
        r.state = State.SUSPENDED;
        r.evidence = evidence;
        r.updatedAtBlock = uint64(block.number);

        emit Transition(
            agentId,
            from,
            State.SUSPENDED,
            seq,
            evidence,
            msg.sender,
            r.controller,
            r.authorityEpoch,
            r.policyDigest,
            bytes32(0),
            prevBlock,
            block.number,
            block.timestamp
        );
        return seq;
    }

    // ---------------------------------------------------------------- reads

    function getRecord(uint256 agentId) external view returns (Record memory) {
        return _records[agentId];
    }

    function agentCount() external view returns (uint256) {
        return _agentIds.length;
    }

    /// @notice Registration-ordered slice of recorded agent ids, clamped to the array end.
    function agentIds(uint256 start, uint256 count) external view returns (uint256[] memory ids) {
        uint256 n = _agentIds.length;
        if (start >= n) return new uint256[](0);
        uint256 end = start + count > n ? n : start + count;
        ids = new uint256[](end - start);
        for (uint256 i = start; i < end; i++) {
            ids[i - start] = _agentIds[i];
        }
    }

    function getOperation(address caller, bytes32 operationId) external view returns (Operation memory) {
        return _operations[keccak256(abi.encode(caller, operationId))];
    }

    /// @notice Live view: the stored state plus whether the ERC-8004 binding still matches.
    ///         `operational` is the only value a counterparty should treat as "open for work".
    function liveStatus(uint256 agentId)
        external
        view
        returns (State state, bool ownerMatches, bool walletMatches, bool operational)
    {
        Record storage r = _records[agentId];
        state = r.state;
        if (state == State.NONE) return (state, false, false, false);
        ownerMatches = _tryOwnerOf(agentId) == r.ownerSnapshot;
        address w = _tryWallet(agentId);
        walletMatches = w != address(0) && w == r.walletSnapshot;
        operational = state == State.ACTIVE && ownerMatches && walletMatches;
    }

    /// @notice CAIP-style registry coordinate used in every ALP record: "eip155:<chainId>:<registry>".
    ///         The registry address is lowercase hex in this binding.
    function agentRegistry() public view returns (string memory) {
        return string.concat("eip155:", Strings.toString(block.chainid), ":", Strings.toHexString(address(IDENTITY_REGISTRY)));
    }

    /// @notice EIP-712 digest of an ALP-DISC handshake for this registry's domain.
    function handshakeDigest(
        uint256 agentId,
        string calldata audience,
        bytes32 nonce,
        bytes32 descriptorDigest,
        uint256 lifecycleSequence,
        uint256 authorityEpoch,
        uint256 issuedAt,
        uint256 expiresAt
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    HANDSHAKE_TYPEHASH,
                    keccak256(bytes(agentRegistry())),
                    keccak256(bytes(Strings.toString(agentId))),
                    keccak256(bytes(audience)),
                    nonce,
                    descriptorDigest,
                    lifecycleSequence,
                    authorityEpoch,
                    issuedAt,
                    expiresAt
                )
            )
        );
    }

    /// @notice On-chain half of handshake verification. Nonce single-use, audience binding and
    ///         descriptor freshness are the caller's job (they are session state, not chain state).
    /// @return ok     True only if every check passed.
    /// @return reason 0 ok, 1 no record, 2 retired, 3 owner changed, 4 wallet unset/changed,
    ///                5 stale sequence, 6 stale epoch, 7 bad time window, 8 bad signature.
    function verifyHandshake(
        uint256 agentId,
        string calldata audience,
        bytes32 nonce,
        bytes32 descriptorDigest,
        uint256 lifecycleSequence,
        uint256 authorityEpoch,
        uint256 issuedAt,
        uint256 expiresAt,
        bytes calldata signature
    ) external view returns (bool ok, uint8 reason) {
        Record storage r = _records[agentId];
        if (r.state == State.NONE) return (false, 1);
        if (r.retired) return (false, 2);
        if (_tryOwnerOf(agentId) != r.ownerSnapshot) return (false, 3);
        address wallet = _tryWallet(agentId);
        if (wallet == address(0) || wallet != r.walletSnapshot) return (false, 4);
        if (lifecycleSequence != r.sequence) return (false, 5);
        if (authorityEpoch != r.authorityEpoch) return (false, 6);
        if (
            issuedAt > block.timestamp + MAX_CLOCK_SKEW || block.timestamp > expiresAt || expiresAt < issuedAt
                || expiresAt - issuedAt > MAX_HANDSHAKE_TTL
        ) return (false, 7);
        bytes32 digest =
            handshakeDigest(agentId, audience, nonce, descriptorDigest, lifecycleSequence, authorityEpoch, issuedAt, expiresAt);
        if (!_isWalletSignature(wallet, digest, signature)) return (false, 8);
        return (true, 0);
    }

    // ---------------------------------------------------------------- internal

    function _validEdge(State from, State to) private pure returns (bool) {
        if (from == State.REGISTERED) return to == State.ACTIVE || to == State.SUSPENDED || to == State.RETIRED;
        if (from == State.ACTIVE) return to == State.SUSPENDED || to == State.RETIRED;
        if (from == State.SUSPENDED) return to == State.ACTIVE || to == State.RETIRED;
        return false;
    }

    /// @dev Same id + same request => return the original result. Same id + different request => revert.
    function _checkOperation(bytes32 operationId, bytes32 requestHash) private view returns (bool replay, uint64 prior) {
        if (operationId == bytes32(0)) revert ZeroValue();
        Operation storage op = _operations[_opKey(operationId)];
        if (op.requestHash == bytes32(0)) return (false, 0);
        if (op.requestHash != requestHash) revert IdempotencyConflict(operationId);
        return (true, op.resultSequence);
    }

    /// @dev Same order as the ERC-8004 registry's own wallet proof: plain ECDSA first, then
    ///      ERC-1271. Checking code length first would reject EIP-7702 (BEP-441) delegated EOAs,
    ///      which carry code but still sign with their own key.
    function _isWalletSignature(address wallet, bytes32 digest, bytes calldata signature) private view returns (bool) {
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err == ECDSA.RecoverError.NoError && recovered == wallet) return true;
        return SignatureChecker.isValidERC1271SignatureNow(wallet, digest, signature);
    }

    function _opKey(bytes32 operationId) private view returns (bytes32) {
        return keccak256(abi.encode(msg.sender, operationId));
    }

    function _tryOwnerOf(uint256 agentId) private view returns (address) {
        try IDENTITY_REGISTRY.ownerOf(agentId) returns (address o) {
            return o;
        } catch {
            return address(0);
        }
    }

    function _tryWallet(uint256 agentId) private view returns (address) {
        try IDENTITY_REGISTRY.getAgentWallet(agentId) returns (address w) {
            return w;
        } catch {
            return address(0);
        }
    }
}
