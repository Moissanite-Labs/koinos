// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.38;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

struct Claim {
    address principal;
    address actor;
    bytes32 evidence;
    bytes32 workId;
    bytes32 creditHash;
}
interface IProjectPolicy {
    function termsHash() external view returns (bytes32);
    function criteriaHash() external view returns (bytes32);
    function rewardPolicyHash() external view returns (bytes32);
}
interface IAcceptance {
    function policyKind() external pure returns (uint8);
    function verify(address project, Claim calldata claim, bytes calldata proof) external view returns (bytes32 nullifier);
}

/// Educational predicate: one immutable work item, one hash preimage. Not software quality.
contract PreimageVerifier is IAcceptance {
    bytes32 public immutable workId;
    bytes32 public immutable target;
    constructor(bytes32 work, bytes32 hashTarget) {
        require(work != bytes32(0) && hashTarget != bytes32(0), "empty task");
        workId = work; target = hashTarget;
    }
    function policyKind() external pure returns (uint8) { return 0; }
    function verify(address, Claim calldata claim, bytes calldata proof) external view returns (bytes32) {
        require(claim.workId == workId && claim.evidence == target && keccak256(proof) == target, "predicate rejected");
        return workId; // The claimant cannot choose a new nullifier for the same task.
    }
}

/// Explicit trusted-reviewer policy. Signatures bind the exact project and immutable rules.
contract QuorumVerifier is IAcceptance, EIP712 {
    bytes32 public constant REVIEW_TYPEHASH = keccak256("Review(address project,address principal,address actor,bytes32 evidence,bytes32 workId,bytes32 creditHash,bytes32 termsHash,bytes32 criteriaHash,bytes32 rewardPolicyHash)");
    uint256 public immutable quorum;
    address[] public reviewers;
    mapping(address => bool) public isReviewer;
    constructor(address[] memory members, uint256 threshold) EIP712("KoinosReview", "1") {
        require(members.length > 0 && members.length <= 32 && threshold > 0 && threshold <= members.length, "bad quorum");
        address previous;
        for (uint256 i; i < members.length; ++i) {
            require(members[i] > previous, "reviewers must be sorted unique");
            isReviewer[members[i]] = true; reviewers.push(members[i]); previous = members[i];
        }
        quorum = threshold;
    }
    function reviewerCount() external view returns (uint256) { return reviewers.length; }
    function policyKind() external pure returns (uint8) { return 1; }
    function reviewDigest(address project, Claim calldata claim) public view returns (bytes32) {
        IProjectPolicy policy = IProjectPolicy(project);
        return _hashTypedDataV4(keccak256(abi.encode(REVIEW_TYPEHASH, project, claim.principal, claim.actor, claim.evidence, claim.workId, claim.creditHash, policy.termsHash(), policy.criteriaHash(), policy.rewardPolicyHash())));
    }
    function verify(address project, Claim calldata claim, bytes calldata proof) external view returns (bytes32) {
        require(proof.length <= 8192, "oversized proof");
        bytes[] memory signatures = abi.decode(proof, (bytes[]));
        require(signatures.length >= quorum && signatures.length <= reviewers.length, "insufficient quorum");
        bytes32 digest = reviewDigest(project, claim);
        address previous;
        for (uint256 i; i < signatures.length; ++i) {
            address signer = ECDSA.recover(digest, signatures[i]);
            require(isReviewer[signer] && signer > previous, "unknown or duplicate reviewer");
            previous = signer;
        }
        require(claim.workId != bytes32(0), "empty work");
        return claim.workId; // Reviewers attest that this is a unique work item.
    }
}

/// Anyone can instantiate these two known fixed verifier families. No administrator.
contract VerifierFactory {
    mapping(address => bool) public isVerifier;
    event VerifierCreated(address indexed verifier, uint8 kind);
    function createPreimage(bytes32 workId, bytes32 target) external returns (address) {
        address verifier = address(new PreimageVerifier(workId, target));
        isVerifier[verifier] = true; emit VerifierCreated(verifier, 0); return verifier;
    }
    function createQuorum(address[] calldata reviewers, uint256 quorum) external returns (address) {
        address verifier = address(new QuorumVerifier(reviewers, quorum));
        isVerifier[verifier] = true; emit VerifierCreated(verifier, 1); return verifier;
    }
}
