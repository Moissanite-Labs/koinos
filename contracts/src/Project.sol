// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.38;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Claim, IAcceptance, VerifierFactory, QuorumVerifier} from "./Acceptance.sol";

struct ProjectConfig {
    string name;
    string symbol;
    bytes32 termsHash;
    bytes32 criteriaHash;
    address verifier;
    address paymentAsset;
    address sourceProject;
    uint16 sourceFeeBps;
    uint16 rewardBps;
    uint256 maxSupply;
    uint256 maxAward;
    uint32 maxAwards;
    address appealVerifier;
    uint32 settlementDelay;
    uint32 appealTimeout;
    uint256 challengeBond;
}
struct CreditPlan { address[] recipients; uint16[] weights; }

/// Local research reference. No owner, administrative mint, upgrade, burn or pause.
contract Project is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant MAX_UNITS = type(uint80).max;
    uint256 public constant MAGNITUDE = 1 << 64;
    bytes32 public immutable termsHash;
    bytes32 public immutable criteriaHash;
    bytes32 public immutable rewardPolicyHash;
    IAcceptance public immutable verifier;
    IERC20 public immutable paymentAsset;
    Project public immutable sourceProject;
    uint16 public immutable sourceFeeBps;
    uint16 public immutable rewardBps;
    uint256 public immutable maxSupply;
    uint256 public immutable maxAward;
    uint32 public immutable maxAwards;
    uint32 public awardCount;
    IAcceptance public immutable appealVerifier;
    uint32 public immutable settlementDelay;
    uint32 public immutable appealTimeout;
    uint256 public immutable challengeBond;
    uint256 public bondEscrow;
    mapping(address => uint256) public bondClaimable;
    struct Pending {
        Claim claim;
        uint64 readyAt;
        bytes32 challengeEvidence;
        bool appealApproved;
        address challenger;
    }
    mapping(bytes32 => Pending) public pending;
    mapping(bytes32 => bool) public cancelled;
    mapping(address => uint256) public earnedCredit;
    mapping(bytes32 => bool) public awarded;
    mapping(address => mapping(bytes32 => uint256)) public commitments;
    struct Delegation { uint64 expires; bool revoked; }
    mapping(bytes32 => Delegation) public delegations;
    uint256 public revenuePerShare;
    mapping(address => int256) private revenueCorrection;
    mapping(address => uint256) public withdrawn;
    uint256 public totalRevenue;
    uint256 public totalPaid;
    uint256 public totalSourceFees;
    uint256 public roundingNumerator; // Sum of each deposit's discarded magnified remainder.

    event BondWithdrawn(address indexed recipient, uint256 amount);
    event SettlementPending(bytes32 indexed nullifier, address indexed actor, uint64 readyAt);
    event Challenged(bytes32 indexed nullifier, address indexed challenger, bytes32 evidence);
    event ChallengeResolved(bytes32 indexed nullifier, bool approved);
    event SettlementCancelled(bytes32 indexed nullifier, string reason);
    event InitialAllocation(address indexed recipient, uint256 amount);
    event Committed(address indexed actor, bytes32 indexed commitment, uint256 blockNumber);
    event Delegated(address indexed principal, address indexed agent, bytes32 indexed scope, bytes32 workId, bytes32 creditHash, uint64 expires);
    event Revoked(address indexed principal, bytes32 indexed scope);
    event Submitted(address indexed actor, address indexed principal, bytes32 indexed workId, bytes32 evidence, bytes32 creditHash);
    event Accepted(address indexed actor, address indexed principal, bytes32 indexed nullifier, bytes32 evidence, bytes32 creditHash, uint256 minted);
    event CreditEarned(bytes32 indexed nullifier, address indexed recipient, uint256 units);
    event RevenueDeposited(address indexed payer, uint256 gross, uint256 sourceFee, uint256 holderRevenue);
    event RevenueWithdrawn(address indexed holder, uint256 amount);

    constructor(ProjectConfig memory config, address[] memory initialRecipients, uint256[] memory initialAmounts) ERC20(config.name, config.symbol) {
        require(bytes(config.name).length > 0 && bytes(config.name).length <= 128 && bytes(config.symbol).length > 0 && bytes(config.symbol).length <= 16, "bad names");
        require(config.termsHash != 0 && config.criteriaHash != 0 && config.verifier.code.length > 0 && config.paymentAsset.code.length > 0, "missing policy or asset");
        require(config.rewardBps > 0 && config.rewardBps <= 1000 && config.maxAwards > 0 && config.maxAwards <= 10000, "bad award policy");
        require(config.maxSupply > 0 && config.maxSupply <= MAX_UNITS && config.maxAward > 0 && config.maxAward <= config.maxSupply, "bad supply limits");
        require(config.sourceFeeBps <= 10000 && (config.sourceProject != address(0) || config.sourceFeeBps == 0), "bad source fee");
        if (config.sourceProject != address(0)) {
            Project source = Project(config.sourceProject);
            require(address(source.paymentAsset()) == config.paymentAsset && address(source.sourceProject()) == address(0), "source must be compatible root");
        }
        uint8 kind = IAcceptance(config.verifier).policyKind();
        require(kind <= 1 && (kind == 0 ? config.settlementDelay == 0 : config.settlementDelay > 0), "verifier settlement mismatch");
        if (config.settlementDelay == 0) {
            require(config.appealVerifier == address(0) && config.appealTimeout == 0 && config.challengeBond == 0, "objective has no appeal");
        } else {
            require(config.settlementDelay <= 30 days && config.appealTimeout > 0 && config.appealTimeout <= 30 days && config.appealVerifier.code.length > 0 && config.challengeBond > 0 && config.challengeBond <= MAX_UNITS && config.appealVerifier != config.verifier && IAcceptance(config.appealVerifier).policyKind() == 1, "bad appeal policy");
        }
        appealVerifier = IAcceptance(config.appealVerifier); settlementDelay = config.settlementDelay; appealTimeout = config.appealTimeout; challengeBond = config.challengeBond;
        termsHash = config.termsHash; criteriaHash = config.criteriaHash;
        verifier = IAcceptance(config.verifier); paymentAsset = IERC20(config.paymentAsset);
        sourceProject = Project(config.sourceProject); sourceFeeBps = config.sourceFeeBps;
        rewardBps = config.rewardBps; maxSupply = config.maxSupply; maxAward = config.maxAward; maxAwards = config.maxAwards;
        rewardPolicyHash = keccak256(abi.encode(config.rewardBps, config.maxSupply, config.maxAward, config.maxAwards, config.sourceProject, config.sourceFeeBps, config.paymentAsset, config.appealVerifier, config.settlementDelay, config.appealTimeout, config.challengeBond));
        require(initialRecipients.length > 0 && initialRecipients.length <= 32 && initialRecipients.length == initialAmounts.length, "bad initial allocation");
        address previous;
        for (uint256 i; i < initialRecipients.length; ++i) {
            require(initialRecipients[i] > previous && initialAmounts[i] > 0, "initial sorted unique positive");
            require(initialAmounts[i] <= maxSupply - totalSupply(), "initial supply cap");
            _mint(initialRecipients[i], initialAmounts[i]); previous = initialRecipients[i];
            emit InitialAllocation(initialRecipients[i], initialAmounts[i]);
        }
    }
    function creditPlanHash(CreditPlan calldata plan) public pure returns (bytes32) {
        require(plan.recipients.length > 0 && plan.recipients.length <= 32 && plan.recipients.length == plan.weights.length, "bad credit plan");
        address previous; uint256 sum;
        for (uint256 i; i < plan.recipients.length; ++i) {
            require(plan.recipients[i] > previous && plan.weights[i] > 0, "plan sorted unique positive");
            previous = plan.recipients[i]; sum += plan.weights[i];
        }
        require(sum == 10000, "weights must sum to 10000");
        return keccak256(abi.encode(plan.recipients, plan.weights));
    }
    function delegationScope(address principal, address actor, bytes32 workId, bytes32 creditHash) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), principal, actor, workId, creditHash));
    }
    function grantDelegation(address agent, bytes32 workId, bytes32 creditHash, uint64 expires) external {
        require(agent != address(0) && agent != msg.sender && workId != 0 && creditHash != 0 && expires > block.timestamp, "bad delegation");
        bytes32 scope = delegationScope(msg.sender, agent, workId, creditHash);
        require(delegations[scope].expires == 0, "scope already granted");
        delegations[scope] = Delegation(expires, false);
        emit Delegated(msg.sender, agent, scope, workId, creditHash, expires);
    }
    function revokeDelegation(address agent, bytes32 workId, bytes32 creditHash) external {
        bytes32 scope = delegationScope(msg.sender, agent, workId, creditHash);
        require(delegations[scope].expires > 0 && !delegations[scope].revoked, "no active grant");
        delegations[scope].revoked = true; emit Revoked(msg.sender, scope);
    }
    function commitmentHash(Claim calldata claim, bytes calldata proof, bytes32 salt) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, msg.sender, claim.principal, claim.actor, claim.evidence, claim.workId, claim.creditHash, keccak256(proof), salt));
    }
    function commit(bytes32 commitment) external {
        require(commitment != 0 && commitments[msg.sender][commitment] == 0, "bad or duplicate commitment");
        commitments[msg.sender][commitment] = block.number; emit Committed(msg.sender, commitment, block.number);
    }
    function reveal(Claim calldata claim, CreditPlan calldata plan, bytes calldata proof, bytes32 salt) external nonReentrant returns (uint256 amount) {
        require(claim.actor == msg.sender && claim.principal != address(0) && claim.evidence != 0, "actor or evidence mismatch");
        require(proof.length <= 8192 && creditPlanHash(plan) == claim.creditHash, "credit or proof mismatch");
        bytes32 commitment = commitmentHash(claim, proof, salt);
        uint256 atBlock = commitments[msg.sender][commitment];
        require(atBlock != 0 && block.number > atBlock, "prior block commitment required");
        _authority(claim);
        bytes32 nullifier = verifier.verify(address(this), claim, proof);
        require(nullifier != 0 && !awarded[nullifier] && !cancelled[nullifier] && pending[nullifier].readyAt == 0, "work already used");
        delete commitments[msg.sender][commitment];
        emit Submitted(claim.actor, claim.principal, claim.workId, claim.evidence, claim.creditHash);
        if (settlementDelay > 0) {
            uint64 readyAt = uint64(block.timestamp + settlementDelay);
            pending[nullifier] = Pending(claim, readyAt, 0, false, address(0));
            emit SettlementPending(nullifier, claim.actor, readyAt);
            return 0;
        }
        return _award(nullifier, claim, plan);
    }
    function _authority(Claim memory claim) internal view {
        if (claim.principal != claim.actor) {
            Delegation memory d = delegations[delegationScope(claim.principal, claim.actor, claim.workId, claim.creditHash)];
            require(!d.revoked && d.expires > block.timestamp, "delegation inactive");
        }
    }
    function challenge(bytes32 nullifier, bytes32 evidence) external nonReentrant {
        Pending storage p = pending[nullifier];
        require(p.readyAt != 0 && block.timestamp < p.readyAt && p.challengeEvidence == 0 && evidence != 0, "challenge closed");
        require(challengeBond <= MAX_UNITS - bondEscrow, "bond escrow cap");
        uint256 beforeBalance = paymentAsset.balanceOf(address(this));
        paymentAsset.safeTransferFrom(msg.sender, address(this), challengeBond);
        require(paymentAsset.balanceOf(address(this)) == beforeBalance + challengeBond, "nonstandard bond");
        p.challengeEvidence = evidence; p.challenger = msg.sender; bondEscrow += challengeBond;
        emit Challenged(nullifier, msg.sender, evidence);
    }
    function appealClaim(bytes32 nullifier, bool approve) public view returns (Claim memory result) {
        Pending storage p = pending[nullifier];
        require(p.readyAt != 0 && p.challengeEvidence != 0, "no challenged claim");
        result = p.claim;
        result.evidence = keccak256(abi.encode("KOINOS_APPEAL_V1", p.claim.evidence, p.challengeEvidence, approve));
    }
    function resolveChallenge(bytes32 nullifier, bool approve, bytes calldata proof) external nonReentrant {
        Pending storage p = pending[nullifier];
        require(p.readyAt != 0 && p.challengeEvidence != 0 && !p.appealApproved && block.timestamp < uint256(p.readyAt) + appealTimeout, "appeal closed");
        require(proof.length <= 8192 && appealVerifier.verify(address(this), appealClaim(nullifier, approve), proof) == nullifier, "appeal rejected");
        if (approve) {
            p.appealApproved = true;
            bondClaimable[p.claim.principal] += challengeBond;
        }
        else { bondClaimable[p.challenger] += challengeBond; cancelled[nullifier] = true; delete pending[nullifier]; emit SettlementCancelled(nullifier, "appeal rejected"); }
        emit ChallengeResolved(nullifier, approve);
    }
    function cancelExpired(bytes32 nullifier) external {
        Pending storage p = pending[nullifier];
        require(p.readyAt != 0 && block.timestamp >= uint256(p.readyAt) + appealTimeout, "not expired");
        if (p.challenger != address(0) && !p.appealApproved) bondClaimable[p.challenger] += challengeBond;
        cancelled[nullifier] = true; delete pending[nullifier];
        emit SettlementCancelled(nullifier, "settlement timed out");
    }
    function withdrawBondCredit() external nonReentrant {
        uint256 amount = bondClaimable[msg.sender];
        require(amount > 0, "no bond credit");
        bondClaimable[msg.sender] = 0; bondEscrow -= amount;
        uint256 beforeBalance = paymentAsset.balanceOf(address(this));
        uint256 recipientBefore = paymentAsset.balanceOf(msg.sender);
        paymentAsset.safeTransfer(msg.sender, amount);
        require(paymentAsset.balanceOf(address(this)) + amount == beforeBalance && paymentAsset.balanceOf(msg.sender) == recipientBefore + amount, "nonstandard bond payout");
        emit BondWithdrawn(msg.sender, amount);
    }
    function finalize(bytes32 nullifier, CreditPlan calldata plan) external nonReentrant returns (uint256) {
        Pending memory p = pending[nullifier];
        require(p.readyAt != 0 && block.timestamp >= p.readyAt && block.timestamp < uint256(p.readyAt) + appealTimeout, "not ready or expired");
        require(p.challengeEvidence == 0 || p.appealApproved, "unresolved challenge");
        require(creditPlanHash(plan) == p.claim.creditHash, "credit plan mismatch");
        _authority(p.claim); // Revocation/expiry also blocks delayed acceptance.
        delete pending[nullifier];
        return _award(nullifier, p.claim, plan);
    }
    function _award(bytes32 nullifier, Claim memory claim, CreditPlan calldata plan) internal returns (uint256 amount) {
        require(!awarded[nullifier] && !cancelled[nullifier] && awardCount < maxAwards, "award count or used work");
        amount = Math.mulDiv(totalSupply(), rewardBps, 10000 - rewardBps, Math.Rounding.Ceil);
        require(amount <= maxAward && amount <= maxSupply - totalSupply(), "award or supply cap");
        awarded[nullifier] = true; ++awardCount;
        uint256 remaining = amount;
        // Floors for all but last sorted recipient; last receives the exact remainder.
        for (uint256 i; i < plan.recipients.length; ++i) {
            uint256 units = i + 1 == plan.recipients.length ? remaining : Math.mulDiv(amount, plan.weights[i], 10000);
            remaining -= units;
            earnedCredit[plan.recipients[i]] += units;
            _mint(plan.recipients[i], units);
            emit CreditEarned(nullifier, plan.recipients[i], units);
        }
        emit Accepted(claim.actor, claim.principal, nullifier, claim.evidence, claim.creditHash, amount);
    }
    function withdrawable(address account) public view returns (uint256) {
        int256 magnified = int256(revenuePerShare * balanceOf(account)) + revenueCorrection[account];
        require(magnified >= 0, "negative accrual");
        return uint256(magnified) / MAGNITUDE - withdrawn[account];
    }
    function depositRevenue(uint256 amount) external nonReentrant {
        require(amount > 0 && amount <= MAX_UNITS - totalRevenue - totalSourceFees, "revenue cap");
        uint256 beforeBalance = paymentAsset.balanceOf(address(this));
        paymentAsset.safeTransferFrom(msg.sender, address(this), amount);
        require(paymentAsset.balanceOf(address(this)) == beforeBalance + amount, "nonstandard payment asset");
        uint256 fee = Math.mulDiv(amount, sourceFeeBps, 10000);
        uint256 net = amount - fee;
        totalSourceFees += fee; totalRevenue += net;
        if (net > 0) {
            uint256 scaled = net * MAGNITUDE;
            revenuePerShare += scaled / totalSupply();
            roundingNumerator += scaled % totalSupply();
        }
        if (fee > 0) {
            paymentAsset.forceApprove(address(sourceProject), fee);
            sourceProject.depositRevenue(fee);
            paymentAsset.forceApprove(address(sourceProject), 0);
            require(paymentAsset.balanceOf(address(this)) == beforeBalance + net, "source fee mismatch");
        }
        emit RevenueDeposited(msg.sender, amount, fee, net);
    }
    function withdrawRevenue() external nonReentrant {
        uint256 amount = withdrawable(msg.sender);
        require(amount > 0, "nothing accrued");
        withdrawn[msg.sender] += amount; totalPaid += amount;
        uint256 beforeBalance = paymentAsset.balanceOf(address(this));
        uint256 recipientBefore = paymentAsset.balanceOf(msg.sender);
        paymentAsset.safeTransfer(msg.sender, amount);
        require(paymentAsset.balanceOf(address(this)) + amount == beforeBalance && paymentAsset.balanceOf(msg.sender) == recipientBefore + amount, "nonstandard payout");
        emit RevenueWithdrawn(msg.sender, amount);
    }
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        int256 correction = int256(revenuePerShare * value);
        if (from != address(0)) revenueCorrection[from] += correction;
        if (to != address(0)) revenueCorrection[to] -= correction;
    }
}

contract ProjectFactory {
    VerifierFactory public immutable verifierFactory = new VerifierFactory();
    mapping(address => bool) public isProject;
    event ProjectCreated(address indexed project, address indexed creator, address indexed sourceProject, bytes32 termsHash, address verifier);
    function create(ProjectConfig calldata config, address[] calldata recipients, uint256[] calldata amounts) external returns (address) {
        require(config.sourceProject == address(0) || isProject[config.sourceProject], "source not from this factory");
        require(verifierFactory.isVerifier(config.verifier), "unrecognized verifier");
        require(config.settlementDelay == 0 || verifierFactory.isVerifier(config.appealVerifier), "unrecognized appeal verifier");
        if (config.settlementDelay > 0) {
            QuorumVerifier primary = QuorumVerifier(config.verifier);
            QuorumVerifier appeal = QuorumVerifier(config.appealVerifier);
            for (uint256 i; i < primary.reviewerCount(); ++i) {
                require(!appeal.isReviewer(primary.reviewers(i)), "appeal reviewer overlap");
            }
        }
        Project project = new Project(config, recipients, amounts);
        isProject[address(project)] = true;
        emit ProjectCreated(address(project), msg.sender, config.sourceProject, config.termsHash, config.verifier);
        return address(project);
    }
}
