import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import solc from "solc";
import { toUtf8Bytes, keccak256 } from "ethers";
import { bridgeContext } from "./open-bridge.mjs";
import {
  chain,
  hash,
  policy,
  plan,
  planHash,
  claimFor,
  award,
  attest,
  advance,
  root,
} from "./harness.mjs";

export async function runLocalDemo() {
  const c = await chain();
  try {
    const checks = [];
    const check = (name, actual, expected) => {
      assert.equal(actual, expected, name);
      checks.push({ name, passed: true });
    };
    const payment = await c.deploy("TestPayment");
    const factory = await c.deploy("ProjectFactory");
    const proof = toUtf8Bytes("educational seed task answer"),
      workId = hash("common catalogue hash-preimage task");
    const objective = await c.makeVerifier(factory, "objective", [
      workId,
      keccak256(proof),
    ]);
    const sorted = (indices) =>
      indices
        .map((i) => c.addresses[i])
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const primary = await c.makeVerifier(factory, "quorum", [
      sorted([5, 6, 7]),
      2,
    ]);
    const appeal = await c.makeVerifier(factory, "quorum", [sorted([8, 9]), 2]);
    const graphContext = bridgeContext({
      principalAddress: c.addresses[1],
      agentAddress: c.addresses[2],
      primaryVerifier: await primary.getAddress(),
      appealVerifier: await appeal.getAddress(),
    });
    const source = await c.create(
      factory,
      policy(await objective.getAddress(), await payment.getAddress(), {
        name: "Common catalogue infrastructure",
        symbol: "COMMON",
        ...graphContext.sourcePolicy,
      }),
    );
    const sourcePlan = plan([
      [c.addresses[0], 7000],
      [c.addresses[2], 3000],
    ]);
    const sourceClaim = await claimFor(
      source,
      c.signers[2],
      workId,
      sourcePlan,
      { principal: c.addresses[0], evidence: keccak256(proof) },
    );
    let now = (await c.provider.getBlock("latest")).timestamp;
    await c.record(
      "principal delegates exact common task and credit plan",
      source.grantDelegation(
        c.addresses[2],
        workId,
        planHash(sourcePlan),
        now + 3600,
      ),
    );
    const sourceReceipt = await award(
      c,
      source,
      c.signers[2],
      sourceClaim,
      sourcePlan,
      proof,
    );
    check(
      "objective task finalized and minted without discretionary approval",
      await source.totalSupply(),
      10000n,
    );
    const branch = await c.create(
      factory,
      policy(await primary.getAddress(), await payment.getAddress(), {
        name: "Regional seed marketplace",
        symbol: "REGION",
        sourceProject: await source.getAddress(),
        sourceFeeBps: 2000,
        appealVerifier: await appeal.getAddress(),
        settlementDelay: 60,
        appealTimeout: 120,
        challengeBond: 50n,
        ...graphContext.branchPolicy,
      }),
      [[c.addresses[1], 9900n]],
    );
    const deposit = async (amount, label) => {
      await c.record(
        `${label}: fund payer with local faucet asset`,
        payment.mint(c.addresses[0], amount),
      );
      await c.record(
        `${label}: approve exact funded revenue`,
        payment.approve(await branch.getAddress(), amount),
      );
      await c.record(
        `${label}: deposit funded receipts`,
        branch.depositRevenue(amount),
      );
    };
    await deposit(10000n, "before new contributor");
    const historical = await branch.withdrawable(c.addresses[1]);
    const bridge = graphContext.finish(await branch.getAddress());
    const branchPlan = {
      recipients: bridge.payload.recipients,
      weights: bridge.payload.weights,
    };
    const branchClaim = await claimFor(
      branch,
      c.signers[2],
      bridge.payload.workId,
      branchPlan,
      {
        principal: bridge.payload.principal,
        evidence: bridge.payload.evidenceHash,
      },
    );
    check(
      "signed graph terms are the immutable branch terms",
      await branch.termsHash(),
      bridge.payload.termsHash,
    );
    check(
      "signed graph policy is the immutable branch criteria",
      await branch.criteriaHash(),
      bridge.payload.criteriaHash,
    );
    check(
      "signed exact wallet plan feeds the contract claim",
      branchClaim.creditHash,
      planHash(branchPlan),
    );
    await c.record(
      "branch principal delegates exact task",
      branch
        .connect(c.signers[1])
        .grantDelegation(
          c.addresses[2],
          branchClaim.workId,
          planHash(branchPlan),
          now + 3600,
        ),
    );
    const quorumProof = await attest(branch, primary, branchClaim, [
      c.signers[5],
      c.signers[6],
    ]);
    await award(
      c,
      branch,
      c.signers[2],
      branchClaim,
      branchPlan,
      quorumProof,
      hash("branch commitment salt"),
    );
    check(
      "review quorum proposes pending award with no immediate ownership",
      await branch.totalSupply(),
      9900n,
    );
    await c.record("fund challenger bond", payment.mint(c.addresses[4], 50n));
    await c.record(
      "approve exact challenge bond",
      payment.connect(c.signers[4]).approve(await branch.getAddress(), 50n),
    );
    await c.record(
      "challenge exact pending contribution",
      branch
        .connect(c.signers[4])
        .challenge(branchClaim.workId, hash("fictional challenge evidence")),
    );
    check(
      "bond escrow does not become holder revenue",
      await branch.totalRevenue(),
      8000n,
    );
    const appealClaim = await branch.appealClaim(branchClaim.workId, true);
    const appealProof = await attest(
      branch,
      appeal,
      { ...branchClaim, evidence: appealClaim.evidence },
      [c.signers[8], c.signers[9]],
    );
    await c.record(
      "disjoint appeal quorum upholds exact claim",
      branch.resolveChallenge(branchClaim.workId, true, appealProof),
    );
    await advance(c, 61);
    const branchReceipt = await c.record(
      "permissionless finalize after settlement delay",
      branch.connect(c.signers[4]).finalize(branchClaim.workId, branchPlan),
    );
    function acceptedEvent(project, receipt) {
      for (const log of receipt.logs) {
        let event;
        try {
          event = project.interface.parseLog(log);
        } catch {
          continue;
        }
        if (event?.name === "Accepted")
          return {
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            logIndex: log.index,
            observed: {
              actor: event.args.actor,
              principal: event.args.principal,
              workId: event.args.nullifier,
              evidence: event.args.evidence,
              creditHash: event.args.creditHash,
              mintedUnits: event.args.minted.toString(),
            },
          };
      }
      throw Error("Missing actual Accepted event");
    }
    const sourceObserved = acceptedEvent(source, sourceReceipt),
      branchObserved = acceptedEvent(branch, branchReceipt);
    check(
      "actual Accepted event matches signed graph work",
      branchObserved.observed.workId,
      bridge.payload.workId,
    );
    check(
      "actual Accepted event matches signed graph evidence",
      branchObserved.observed.evidence,
      bridge.payload.evidenceHash,
    );
    check(
      "actual Accepted event matches exact derived credit split",
      branchObserved.observed.creditHash,
      planHash(branchPlan),
    );
    const settledGraph = bridge.recordSettlement(branchReceipt.hash);
    check(
      "quorum award mints one hundred smallest units",
      await branch.totalSupply(),
      10000n,
    );
    check(
      "mint does not award historical receipts to new contributor",
      await branch.withdrawable(c.addresses[2]),
      0n,
    );
    check(
      "historical accrual remains with original holder",
      await branch.withdrawable(c.addresses[1]),
      historical,
    );
    await c.record(
      "principal withdraws forfeited challenge bond",
      branch.connect(c.signers[1]).withdrawBondCredit(),
    );
    check(
      "bond escrow clears independently of revenue",
      await branch.bondEscrow(),
      0n,
    );
    await c.record(
      "transfer ownership units to another holder",
      branch.connect(c.signers[1]).transfer(c.addresses[3], 1000n),
    );
    check(
      "transfer recipient cannot claim earlier revenue",
      await branch.withdrawable(c.addresses[3]),
      0n,
    );
    const originalCredit = await branch.earnedCredit(c.addresses[1]);
    await deposit(10000n, "after award and transfer");
    check(
      "source receives twenty percent of funded branch receipts",
      await source.totalRevenue(),
      4000n,
    );
    check(
      "branch holders receive eighty percent of funded receipts",
      await branch.totalRevenue(),
      16000n,
    );
    check(
      "permanent credit survives ownership transfer",
      await branch.earnedCredit(c.addresses[1]),
      originalCredit,
    );
    for (const [name, project, indices] of [
      ["source", source, [0, 2]],
      ["branch", branch, [1, 2, 3]],
    ]) {
      for (const i of indices)
        if ((await project.withdrawable(c.addresses[i])) > 0n)
          await c.record(
            `${name} holder withdraws accrued receipts`,
            project.connect(c.signers[i]).withdrawRevenue(),
          );
      check(
        `${name} asset reserve reconciles with funded revenue minus payouts`,
        await payment.balanceOf(await project.getAddress()),
        (await project.totalRevenue()) - (await project.totalPaid()),
      );
    }
    const balances = async (project, indices) =>
      Promise.all(
        indices.map(async (i) => ({
          address: c.addresses[i],
          tokenUnits: (await project.balanceOf(c.addresses[i])).toString(),
          earnedCreditUnits: (
            await project.earnedCredit(c.addresses[i])
          ).toString(),
          revenueWithdrawableUnits: (
            await project.withdrawable(c.addresses[i])
          ).toString(),
          revenueWithdrawnUnits: (
            await project.withdrawn(c.addresses[i])
          ).toString(),
        })),
      );
    const report = {
      openGraph: {
        path: "contracts/reports/open-demo.json",
        intent: bridge.intent,
        contribution: bridge.contribution,
        project: bridge.project,
        bundleSha256: settledGraph.bundleSha256,
        payload: bridge.payload,
      },
      format: "koinos-local-evm-report/0.1",
      execution: "local-evm",
      liveNetwork: false,
      chainId: 31337,
      compiler: solc.version(),
      contracts: {
        factory: await factory.getAddress(),
        verifierFactory: await factory.verifierFactory(),
        source: await source.getAddress(),
        branch: await branch.getAddress(),
        paymentAsset: await payment.getAddress(),
        objectiveVerifier: await objective.getAddress(),
        quorumVerifier: await primary.getAddress(),
        appealVerifier: await appeal.getAddress(),
      },
      policy: {
        rewardBps: 100,
        sourceFeeBps: 2000,
        maxSupplyUnits: "1000000",
        maxAwardUnits: "100000",
        maxAwards: 100,
        settlementDelaySeconds: 60,
        appealTimeoutSeconds: 120,
        challengeBondUnits: "50",
        creditSplitRemainder: "last sorted recipient",
        revenueLabel: "funded receipts, not net profits",
        sourceTermsHash: await source.termsHash(),
        branchTermsHash: await branch.termsHash(),
        sourceRewardPolicyHash: await source.rewardPolicyHash(),
        branchRewardPolicyHash: await branch.rewardPolicyHash(),
      },
      transactions: c.transactions,
      checks,
      balances: {
        source: await balances(source, [0, 2]),
        branch: await balances(branch, [1, 2, 3]),
      },
      revenue: {
        grossBranchDepositsUnits: "20000",
        sourceFeeUnits: (await branch.totalSourceFees()).toString(),
        sourceHolderRevenueUnits: (await source.totalRevenue()).toString(),
        branchHolderRevenueUnits: (await branch.totalRevenue()).toString(),
        sourcePayoutsUnits: (await source.totalPaid()).toString(),
        branchPayoutsUnits: (await branch.totalPaid()).toString(),
        sourceRetainedReserveUnits: (
          await payment.balanceOf(await source.getAddress())
        ).toString(),
        branchRetainedReserveUnits: (
          await payment.balanceOf(await branch.getAddress())
        ).toString(),
        branchMagnifiedRoundingNumerator: (
          await branch.roundingNumerator()
        ).toString(),
        magnitude: (await branch.MAGNITUDE()).toString(),
      },
      settlements: [
        {
          ...sourceObserved,
          project: await source.getAddress(),
          workId: sourceClaim.workId,
          evidence: sourceClaim.evidence,
          actor: sourceClaim.actor,
          principal: sourceClaim.principal,
          creditHash: sourceClaim.creditHash,
          verifiedLocally: true,
          trust: "on-chain hash-preimage predicate only",
        },
        {
          ...branchObserved,
          project: await branch.getAddress(),
          workId: branchClaim.workId,
          evidence: branchClaim.evidence,
          actor: branchClaim.actor,
          principal: branchClaim.principal,
          creditHash: branchClaim.creditHash,
          verifiedLocally: true,
          trust: "trusted reviewer quorum and separate bonded appeal policy",
        },
      ],
      limitations: [
        "Fictional local demonstration; no live balances, payments, legal equity or real economic performance.",
        "All units are smallest integer token/asset units, not currency prices or projections.",
        "The objective task verifies a hash preimage, not software quality; the quorum trusts its configured reviewers.",
        "Distinct reviewer addresses do not establish distinct people or resistance to collusion.",
        "Funded receipts do not establish net profits, external income, expenses or ownership rights.",
        "Settled transferable tokens are final in this prototype; later off-chain disputes cannot claw them back.",
        "The local report is historical test evidence, not a trusted live-chain oracle.",
      ],
    };
    return { ...report, publicGraph: settledGraph.bundle };
  } finally {
    await c.close();
  }
}
function isMain() {
  try {
    return (
      !!process.argv[1] &&
      realpathSync(process.argv[1]) ===
        realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}
if (isMain()) {
  const { publicGraph, ...report } = await runLocalDemo();
  const output = resolve(root, "reports/local-demo.json");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  await writeFile(
    resolve(root, "reports/open-demo.json"),
    JSON.stringify(publicGraph, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      report: output,
      execution: report.execution,
      transactions: report.transactions.length,
      checks: report.checks.length,
      liveNetwork: false,
    }),
  );
}
