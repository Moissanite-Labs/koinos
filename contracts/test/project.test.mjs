import test from "node:test";
import assert from "node:assert/strict";
import { toUtf8Bytes, keccak256, Wallet } from "ethers";
import {
  chain,
  hash,
  abi,
  policy,
  plan,
  planHash,
  claimFor,
  award,
  attest,
  advance,
  ZeroAddress,
} from "../scripts/harness.mjs";

async function fixture(extra = {}, asset = "TestPayment") {
  const c = await chain();
  const payment = await c.deploy(asset);
  const workId = hash("unique objective task");
  const proof = toUtf8Bytes("educational seed task answer");
  const factory = await c.deploy("ProjectFactory");
  const verifier = await c.makeVerifier(factory, "objective", [
    workId,
    keccak256(proof),
  ]);
  const project = await c.create(
    factory,
    policy(await verifier.getAddress(), await payment.getAddress(), extra),
  );
  return { ...c, payment, workId, proof, verifier, factory, project };
}
async function committed(
  c,
  project,
  actor,
  claim,
  p,
  proof,
  salt = hash("salt"),
) {
  const connected = project.connect(actor);
  await c.record(
    "commit",
    connected.commit(await connected.commitmentHash(claim, proof, salt)),
  );
  return () => connected.reveal(claim, p, proof, salt);
}
async function fund(c, project, amount, payer = c.signers[0]) {
  const address = await payer.getAddress();
  await c.record("fund test payer", c.payment.mint(address, amount));
  await c.record(
    "approve revenue",
    c.payment.connect(payer).approve(await project.getAddress(), amount),
  );
  await c.record(
    "deposit funded revenue",
    project.connect(payer).depositRevenue(amount),
  );
}

test("permissionless objective claim: commitments, copied proof, wrong proof/nullifier and exact split conservation", async () => {
  const c = await fixture();
  try {
    const p = plan([
      [c.addresses[2], 3333],
      [c.addresses[3], 6667],
    ]);
    const claim = await claimFor(c.project, c.signers[2], c.workId, p);
    await assert.rejects(
      c.project.connect(c.signers[2]).reveal(claim, p, c.proof, hash("salt")),
      /commitment/,
    );
    const reveal = await committed(
      c,
      c.project,
      c.signers[2],
      claim,
      p,
      c.proof,
    );
    await assert.rejects(
      c.project
        .connect(c.signers[2])
        .reveal.staticCall(claim, p, c.proof, hash("salt")),
      /prior block/,
    );
    // Copying the commitment into an attacker's account cannot redirect this claim.
    const victimHash = await c.project
      .connect(c.signers[2])
      .commitmentHash(claim, c.proof, hash("salt"));
    await c.record(
      "attacker copied commitment",
      c.project.connect(c.signers[4]).commit(victimHash),
    );
    await assert.rejects(
      c.project.connect(c.signers[4]).reveal(claim, p, c.proof, hash("salt")),
      /actor/,
    );
    const changed = {
      ...claim,
      actor: c.addresses[4],
      principal: c.addresses[4],
    };
    await assert.rejects(
      c.project.connect(c.signers[4]).reveal(changed, p, c.proof, hash("salt")),
      /commitment/,
    );
    await c.record("valid objective reveal", reveal());
    assert.equal(await c.project.totalSupply(), 10000n);
    assert.equal(await c.project.awardCount(), 1n);
    const credits = await Promise.all(
      p.recipients.map((a) => c.project.earnedCredit(a)),
    );
    assert.deepEqual(credits, [33n, 67n]);
    assert.equal(
      credits.reduce((a, b) => a + b),
      100n,
    );
    await assert.rejects(reveal(), /commitment/);
    await assert.rejects(
      award(c, c.project, c.signers[2], claim, p, c.proof, hash("new salt")),
      /used/,
    );
    const wrong = { ...claim, workId: hash("caller-chosen repeat nullifier") };
    await assert.rejects(
      award(c, c.project, c.signers[2], wrong, p, c.proof, hash("wrong work")),
      /predicate/,
    );
    await assert.rejects(
      award(
        c,
        c.project,
        c.signers[2],
        claim,
        p,
        toUtf8Bytes("wrong proof"),
        hash("wrong proof"),
      ),
      /predicate/,
    );
  } finally {
    await c.close();
  }
});

test("post-mint ceiling, supply/award caps and immutable permanent credit after transfers", async () => {
  const c = await fixture();
  try {
    const p = plan([[c.addresses[2], 10000]]),
      claim = await claimFor(c.project, c.signers[2], c.workId, p);
    await award(c, c.project, c.signers[2], claim, p, c.proof);
    await c.record(
      "transfer earned tokens",
      c.project.connect(c.signers[2]).transfer(c.addresses[3], 100),
    );
    assert.equal(await c.project.earnedCredit(c.addresses[2]), 100n);
    assert.equal(await c.project.balanceOf(c.addresses[2]), 0n);
    assert.equal(await c.project.earnedCredit(c.addresses[3]), 0n);
    const tiny = await c.create(
      c.factory,
      policy(await c.verifier.getAddress(), await c.payment.getAddress(), {
        name: "Rounding",
        maxSupply: 100n,
        maxAward: 10n,
        maxAwards: 1,
      }),
      [[c.addresses[0], 1n]],
    );
    const small = await claimFor(tiny, c.signers[2], c.workId, p);
    await award(c, tiny, c.signers[2], small, p, c.proof);
    assert.equal(await tiny.totalSupply(), 2n); // ceil(1/99)=1, not exactly one percent.
    const capped = await c.create(
      c.factory,
      policy(await c.verifier.getAddress(), await c.payment.getAddress(), {
        name: "Capped",
        maxSupply: 9950n,
        maxAward: 1000n,
      }),
    );
    const capClaim = await claimFor(capped, c.signers[2], c.workId, p);
    await assert.rejects(
      award(c, capped, c.signers[2], capClaim, p, c.proof),
      /cap/,
    );
    const awardCap = await c.create(
      c.factory,
      policy(await c.verifier.getAddress(), await c.payment.getAddress(), {
        maxAward: 99n,
      }),
    );
    await assert.rejects(
      award(
        c,
        awardCap,
        c.signers[2],
        await claimFor(awardCap, c.signers[2], c.workId, p),
        p,
        c.proof,
      ),
      /cap/,
    );
    for (const bad of [
      plan([[c.addresses[2], 9999]]),
      { recipients: [c.addresses[2], c.addresses[2]], weights: [5000, 5000] },
      plan([[ZeroAddress, 10000]]),
    ])
      await assert.rejects(c.project.creditPlanHash(bad));
  } finally {
    await c.close();
  }
});

test("explicit agent delegation binds project, task, plan, expiry and revocation; no spending right", async () => {
  const c = await fixture();
  try {
    const p = plan([
        [c.addresses[0], 7000],
        [c.addresses[2], 3000],
      ]),
      agent = c.signers[2];
    const claim = await claimFor(c.project, agent, c.workId, p, {
      principal: c.addresses[0],
    });
    const reveal = await committed(c, c.project, agent, claim, p, c.proof);
    await assert.rejects(reveal(), /delegation/);
    const now = (await c.provider.getBlock("latest")).timestamp;
    await c.record(
      "grant task delegation",
      c.project.grantDelegation(
        c.addresses[2],
        c.workId,
        planHash(p),
        now + 3600,
      ),
    );
    const otherPlan = plan([[c.addresses[2], 10000]]);
    await assert.rejects(
      award(
        c,
        c.project,
        agent,
        { ...claim, creditHash: planHash(otherPlan) },
        otherPlan,
        c.proof,
        hash("wrong plan"),
      ),
      /delegation/,
    );
    await assert.rejects(
      c.project.connect(agent).transferFrom(c.addresses[0], c.addresses[2], 1),
    );
    await c.record(
      "revoke delegation",
      c.project.revokeDelegation(c.addresses[2], c.workId, planHash(p)),
    );
    await assert.rejects(reveal(), /delegation/);
    await assert.rejects(
      c.project.grantDelegation(
        c.addresses[2],
        c.workId,
        planHash(p),
        now + 3600,
      ),
      /already/,
    );
    const other = await c.create(
      c.factory,
      policy(await c.verifier.getAddress(), await c.payment.getAddress(), {
        name: "Other project",
      }),
    );
    await assert.rejects(
      award(
        c,
        other,
        agent,
        await claimFor(other, agent, c.workId, p, {
          principal: c.addresses[0],
        }),
        p,
        c.proof,
      ),
      /delegation/,
    );
    await c.record(
      "grant expiring delegation",
      other.grantDelegation(c.addresses[2], c.workId, planHash(p), now + 100),
    );
    await advance(c, 110);
    await assert.rejects(
      award(
        c,
        other,
        agent,
        await claimFor(other, agent, c.workId, p, {
          principal: c.addresses[0],
        }),
        p,
        c.proof,
        hash("expired"),
      ),
      /delegation/,
    );
  } finally {
    await c.close();
  }
});

test("funded source/branch revenue, historical accrual after mint and transfer, withdrawal and retained dust", async () => {
  const c = await fixture();
  try {
    const source = c.project;
    const branch = await c.create(
      c.factory,
      policy(await c.verifier.getAddress(), await c.payment.getAddress(), {
        name: "Specialized branch",
        sourceProject: await source.getAddress(),
        sourceFeeBps: 2000,
      }),
      [[c.addresses[1], 9900n]],
    );
    await fund(c, branch, 10000n);
    assert.equal(await source.totalRevenue(), 2000n);
    assert.equal(await branch.totalRevenue(), 8000n);
    assert.equal(await branch.totalSourceFees(), 2000n);
    const before = await branch.withdrawable(c.addresses[1]);
    assert.equal(before, 7999n);
    const p = plan([[c.addresses[2], 10000]]),
      claim = await claimFor(branch, c.signers[2], c.workId, p);
    await award(c, branch, c.signers[2], claim, p, c.proof);
    assert.equal(await branch.withdrawable(c.addresses[2]), 0n);
    assert.equal(await branch.withdrawable(c.addresses[1]), before);
    await c.record(
      "transfer branch ownership",
      branch.connect(c.signers[1]).transfer(c.addresses[3], 4950n),
    );
    assert.equal(await branch.withdrawable(c.addresses[3]), 0n);
    assert.equal(await branch.withdrawable(c.addresses[1]), before);
    await fund(c, branch, 10000n);
    assert.equal(await branch.withdrawable(c.addresses[2]), 79n);
    assert.equal(await branch.withdrawable(c.addresses[3]), 3959n);
    for (const index of [0, 1, 2, 3]) {
      const project = index === 0 ? source : branch;
      if ((await project.withdrawable(c.addresses[index])) > 0n)
        await c.record(
          "withdraw funded accrual",
          project.connect(c.signers[index]).withdrawRevenue(),
        );
    }
    await assert.rejects(
      branch.connect(c.signers[3]).withdrawRevenue(),
      /nothing/,
    );
    assert.equal(
      await c.payment.balanceOf(await branch.getAddress()),
      (await branch.totalRevenue()) - (await branch.totalPaid()),
    );
    assert.equal(await branch.earnedCredit(c.addresses[2]), 100n);
    assert.ok((await branch.roundingNumerator()) > 0n);
  } finally {
    await c.close();
  }
});

test("fee-on-transfer deposits rejected; asset reentry blocked for deposits and withdrawals", async () => {
  const taxed = await fixture({}, "TaxPayment");
  try {
    await assert.rejects(fund(taxed, taxed.project, 100n), /nonstandard/);
    assert.equal(await taxed.project.totalRevenue(), 0n);
  } finally {
    await taxed.close();
  }
  const c = await fixture({}, "CallbackPayment");
  try {
    await c.record(
      "arm deposit reentry",
      c.payment.configure(
        await c.project.getAddress(),
        c.project.interface.encodeFunctionData("depositRevenue", [1]),
      ),
    );
    await fund(c, c.project, 1000n);
    assert.equal(await c.payment.attempted(), true);
    assert.equal(await c.payment.succeeded(), false);
    await c.record(
      "arm withdrawal reentry",
      c.payment.configure(
        await c.project.getAddress(),
        c.project.interface.encodeFunctionData("withdrawRevenue"),
      ),
    );
    await c.record(
      "withdraw with hostile callback",
      c.project.withdrawRevenue(),
    );
    assert.equal(await c.payment.attempted(), true);
    assert.equal(await c.payment.succeeded(), false);
  } finally {
    await c.close();
  }
});

async function quorumFixture(asset = "TestPayment") {
  const c = await fixture({}, asset);
  const sorted = (indices) =>
    indices
      .map((i) => c.addresses[i])
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const primary = await c.makeVerifier(c.factory, "quorum", [
    sorted([5, 6, 7]),
    2,
  ]);
  const appeal = await c.makeVerifier(c.factory, "quorum", [sorted([8, 9]), 2]);
  const project = await c.create(
    c.factory,
    policy(await primary.getAddress(), await c.payment.getAddress(), {
      name: "Quorum branch",
      appealVerifier: await appeal.getAddress(),
      settlementDelay: 60,
      appealTimeout: 120,
      challengeBond: 50n,
      maxAwards: 2,
    }),
  );
  return { ...c, primary, appeal, project };
}
async function pendingClaim(c, name = "reviewed work") {
  const p = plan([[c.addresses[2], 10000]]),
    claim = await claimFor(c.project, c.signers[2], hash(name), p);
  const proof = await attest(c.project, c.primary, claim, [
    c.signers[5],
    c.signers[6],
  ]);
  await award(c, c.project, c.signers[2], claim, p, proof, hash(name + "salt"));
  return { p, claim, proof };
}
async function challenge(c, claim) {
  await c.record("fund challenge bond", c.payment.mint(c.addresses[4], 50));
  await c.record(
    "approve challenge bond",
    c.payment.connect(c.signers[4]).approve(await c.project.getAddress(), 50),
  );
  await c.record(
    "challenge pending work",
    c.project
      .connect(c.signers[4])
      .challenge(claim.workId, hash("counter evidence")),
  );
}

test("quorum rejects duplicate/unknown/wrong-domain/malformed signers and replay; mint waits for settlement delay", async () => {
  const c = await quorumFixture();
  try {
    const p = plan([[c.addresses[2], 10000]]),
      claim = await claimFor(c.project, c.signers[2], hash("reviewed task"), p);
    for (const [reviewers, domain] of [
      [[c.signers[5]], {}],
      [[c.signers[5], c.signers[5]], {}],
      [[c.signers[5], c.signers[4]], {}],
      [[c.signers[5], c.signers[6]], { chainId: 1 }],
      [
        [c.signers[5], c.signers[6]],
        { verifyingContract: await c.appeal.getAddress() },
      ],
    ]) {
      const proof = await attest(
        c.project,
        c.primary,
        claim,
        reviewers,
        domain,
      );
      await assert.rejects(
        award(
          c,
          c.project,
          c.signers[2],
          claim,
          p,
          proof,
          hash(
            JSON.stringify(domain) +
              reviewers.length +
              (await reviewers.at(-1).getAddress()),
          ),
        ),
      );
    }
    await assert.rejects(
      award(
        c,
        c.project,
        c.signers[2],
        claim,
        p,
        abi.encode(["bytes[]"], [["0x1234", "0x12"]]),
        hash("malformed"),
      ),
    );
    const proof = await attest(c.project, c.primary, claim, [
      c.signers[5],
      c.signers[6],
    ]);
    await assert.rejects(
      award(
        c,
        c.project,
        c.signers[2],
        { ...claim, evidence: hash("changed") },
        p,
        proof,
        hash("changed"),
      ),
    );
    await award(c, c.project, c.signers[2], claim, p, proof, hash("valid"));
    assert.equal(await c.project.balanceOf(c.addresses[2]), 0n);
    await assert.rejects(c.project.finalize(claim.workId, p), /not ready/);
    await advance(c, 61);
    await c.record(
      "finalize reviewed award",
      c.project.connect(c.signers[4]).finalize(claim.workId, p),
    );
    assert.equal(await c.project.balanceOf(c.addresses[2]), 100n);
    await assert.rejects(
      award(c, c.project, c.signers[2], claim, p, proof, hash("replay")),
      /used/,
    );
    const second = await pendingClaim(c, "second");
    await advance(c, 61);
    await c.record(
      "second finalization",
      c.project.finalize(second.claim.workId, second.p),
    );
    const third = await pendingClaim(c, "third");
    await advance(c, 61);
    await assert.rejects(
      c.project.finalize(third.claim.workId, third.p),
      /count/,
    );
  } finally {
    await c.close();
  }
});

test("bonded challenge approval pays principal, rejection/timeout refunds challenger; revenue stays separate", async () => {
  const c = await quorumFixture();
  try {
    const first = await pendingClaim(c, "appealed acceptance");
    await assert.rejects(
      c.project.challenge(first.claim.workId, hash("without allowance")),
    );
    await challenge(c, first.claim);
    assert.equal(await c.project.bondEscrow(), 50n);
    assert.equal(await c.project.totalRevenue(), 0n);
    assert.equal(await c.project.withdrawable(c.addresses[0]), 0n);
    await assert.rejects(
      c.project.challenge(first.claim.workId, hash("second challenge")),
      /closed/,
    );
    await advance(c, 61);
    await assert.rejects(
      c.project.finalize(first.claim.workId, first.p),
      /unresolved/,
    );
    const appealClaim = await c.project.appealClaim(first.claim.workId, true);
    const appealProof = await attest(
      c.project,
      c.appeal,
      { ...first.claim, evidence: appealClaim.evidence },
      [c.signers[8], c.signers[9]],
    );
    await assert.rejects(
      c.project.resolveChallenge(first.claim.workId, false, appealProof),
    );
    await c.record(
      "appeal upholds acceptance",
      c.project.resolveChallenge(first.claim.workId, true, appealProof),
    );
    assert.equal(await c.project.bondClaimable(c.addresses[2]), 50n);
    await c.record(
      "finalize after appeal",
      c.project.finalize(first.claim.workId, first.p),
    );
    await c.record(
      "principal withdraws forfeited bond",
      c.project.connect(c.signers[2]).withdrawBondCredit(),
    );
    assert.equal(await c.project.bondEscrow(), 0n);
    await assert.rejects(
      c.project.connect(c.signers[2]).withdrawBondCredit(),
      /no bond/,
    );
    const rejected = await pendingClaim(c, "appealed rejection");
    await challenge(c, rejected.claim);
    const rejection = await c.project.appealClaim(rejected.claim.workId, false);
    const rejectProof = await attest(
      c.project,
      c.appeal,
      { ...rejected.claim, evidence: rejection.evidence },
      [c.signers[8], c.signers[9]],
    );
    await c.record(
      "appeal rejects award",
      c.project.resolveChallenge(rejected.claim.workId, false, rejectProof),
    );
    assert.equal(await c.project.cancelled(rejected.claim.workId), true);
    assert.equal(await c.project.bondClaimable(c.addresses[4]), 50n);
    await c.record(
      "challenger refund",
      c.project.connect(c.signers[4]).withdrawBondCredit(),
    );
    const expired = await pendingClaim(c, "timed out");
    await challenge(c, expired.claim);
    await advance(c, 181);
    await c.record(
      "cancel timed out settlement",
      c.project.cancelExpired(expired.claim.workId),
    );
    assert.equal(await c.project.bondClaimable(c.addresses[4]), 50n);
    await c.record(
      "timeout refund",
      c.project.connect(c.signers[4]).withdrawBondCredit(),
    );
    assert.equal(await c.project.bondEscrow(), 0n);
    const late = await pendingClaim(c, "late challenge");
    await advance(c, 61);
    await assert.rejects(
      c.project.challenge(late.claim.workId, hash("late")),
      /closed/,
    );
  } finally {
    await c.close();
  }
});

test("bond withdrawals reject malicious reentry and quorum policy requires nonzero bond", async () => {
  const c = await quorumFixture("CallbackPayment");
  try {
    const pending = await pendingClaim(c);
    await challenge(c, pending.claim);
    await advance(c, 181);
    await c.record("cancel", c.project.cancelExpired(pending.claim.workId));
    await c.record(
      "arm bond reentry",
      c.payment.configure(
        await c.project.getAddress(),
        c.project.interface.encodeFunctionData("withdrawBondCredit"),
      ),
    );
    await c.record(
      "withdraw bond with hostile callback",
      c.project.connect(c.signers[4]).withdrawBondCredit(),
    );
    assert.equal(await c.payment.attempted(), true);
    assert.equal(await c.payment.succeeded(), false);
    await assert.rejects(
      c.create(
        c.factory,
        policy(await c.primary.getAddress(), await c.payment.getAddress(), {
          appealVerifier: await c.appeal.getAddress(),
          settlementDelay: 60,
          appealTimeout: 120,
          challengeBond: 0,
        }),
      ),
      /appeal/,
    );
  } finally {
    await c.close();
  }
});

test("factory rejects nonregistry policies and overlapping appeal reviewers; claim proof binds evidence and contract", async () => {
  const c = await quorumFixture();
  try {
    const rogue = await c.deploy("PreimageVerifier", [
      c.workId,
      keccak256(c.proof),
    ]);
    await assert.rejects(
      c.create(
        c.factory,
        policy(await rogue.getAddress(), await c.payment.getAddress()),
      ),
      /unrecognized/,
    );
    const overlapping = await c.makeVerifier(c.factory, "quorum", [
      [c.addresses[5], c.addresses[8]].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase()),
      ),
      2,
    ]);
    await assert.rejects(
      c.create(
        c.factory,
        policy(await c.primary.getAddress(), await c.payment.getAddress(), {
          appealVerifier: await overlapping.getAddress(),
          settlementDelay: 60,
          appealTimeout: 120,
          challengeBond: 50,
        }),
      ),
      /overlap/,
    );
    const p = plan([[c.addresses[2], 10000]]),
      claim = await claimFor(
        c.project,
        c.signers[2],
        hash("exact contract task"),
        p,
      );
    const proof = await attest(c.project, c.primary, claim, [
      c.signers[5],
      c.signers[6],
    ]);
    const other = await c.create(
      c.factory,
      policy(await c.primary.getAddress(), await c.payment.getAddress(), {
        appealVerifier: await c.appeal.getAddress(),
        settlementDelay: 60,
        appealTimeout: 120,
        challengeBond: 50,
      }),
    );
    await assert.rejects(award(c, other, c.signers[2], claim, p, proof));
    const objective = await c.create(
      c.factory,
      policy(await c.verifier.getAddress(), await c.payment.getAddress()),
    );
    const invalidEvidence = await claimFor(
      objective,
      c.signers[2],
      c.workId,
      p,
      { evidence: hash("unrelated evidence") },
    );
    await assert.rejects(
      award(c, objective, c.signers[2], invalidEvidence, p, c.proof),
      /predicate/,
    );
  } finally {
    await c.close();
  }
});

test("quorum agent scope is rechecked at finalization and expired pending work cancels without mint", async () => {
  const c = await quorumFixture();
  try {
    const p = plan([[c.addresses[2], 10000]]),
      claim = await claimFor(
        c.project,
        c.signers[2],
        hash("delegated pending task"),
        p,
        { principal: c.addresses[0] },
      );
    const now = (await c.provider.getBlock("latest")).timestamp;
    await c.record(
      "grant pending task",
      c.project.grantDelegation(
        c.addresses[2],
        claim.workId,
        planHash(p),
        now + 1000,
      ),
    );
    const proof = await attest(c.project, c.primary, claim, [
      c.signers[5],
      c.signers[6],
    ]);
    await award(c, c.project, c.signers[2], claim, p, proof);
    await c.record(
      "revoke before finalization",
      c.project.revokeDelegation(c.addresses[2], claim.workId, planHash(p)),
    );
    await advance(c, 61);
    await assert.rejects(c.project.finalize(claim.workId, p), /delegation/);
    await advance(c, 121);
    await c.record(
      "cancel expired pending grant",
      c.project.cancelExpired(claim.workId),
    );
    assert.equal(await c.project.totalSupply(), 9900n);
    assert.equal(await c.project.cancelled(claim.workId), true);
  } finally {
    await c.close();
  }
});

test("bond reserves remain solvent during holder payouts and zero challenge evidence is rejected", async () => {
  const c = await quorumFixture();
  try {
    await fund(c, c.project, 10000n);
    const pending = await pendingClaim(c);
    await challenge(c, pending.claim);
    await c.record(
      "holder withdraws revenue with escrow present",
      c.project.withdrawRevenue(),
    );
    assert.equal(
      await c.payment.balanceOf(await c.project.getAddress()),
      (await c.project.totalRevenue()) - (await c.project.totalPaid()) + 50n,
    );
    await advance(c, 181);
    await c.record(
      "timeout cancels",
      c.project.cancelExpired(pending.claim.workId),
    );
    await c.record(
      "withdraw refunded bond",
      c.project.connect(c.signers[4]).withdrawBondCredit(),
    );
    assert.equal(
      await c.payment.balanceOf(await c.project.getAddress()),
      (await c.project.totalRevenue()) - (await c.project.totalPaid()),
    );
    const next = await pendingClaim(c, "zero evidence");
    await assert.rejects(
      c.project.challenge(next.claim.workId, "0x" + "0".repeat(64)),
      /closed/,
    );
  } finally {
    await c.close();
  }
});

test("signed graph settlement plan drives actual local EVM acceptance event and credited wallets", async () => {
  const { runLocalDemo } = await import("../scripts/demo.mjs");
  const { verifyOpenBundle, deriveSettlementPlan } =
    await import("../../src/open-protocol.mjs");
  const { digestBytes, canonicalize } = await import("../../src/protocol.mjs");
  const { publicGraph, ...report } = await runLocalDemo();
  const state = verifyOpenBundle(publicGraph);
  const derived = deriveSettlementPlan(publicGraph, report.openGraph.intent);
  assert.deepEqual(derived, report.openGraph.payload);
  assert.equal(
    digestBytes(canonicalize(publicGraph)),
    report.openGraph.bundleSha256,
  );
  assert.equal(report.execution, "local-evm");
  assert.equal(report.liveNetwork, false);
  const actual = report.settlements[1];
  assert.equal(actual.observed.workId, derived.workId);
  assert.equal(actual.observed.evidence, derived.evidenceHash);
  assert.equal(
    actual.observed.creditHash,
    planHash({ recipients: derived.recipients, weights: derived.weights }),
  );
  assert.equal(actual.principal.toLowerCase(), derived.principal);
  assert.equal(actual.project.toLowerCase(), derived.contract);
  assert.equal(report.policy.branchTermsHash, derived.termsHash);
  assert.ok(
    report.transactions.some(
      (tx) => tx.hash === actual.transactionHash && tx.status === "success",
    ),
  );
  assert.equal(actual.observed.mintedUnits, "100");
  for (const address of derived.recipients)
    assert.equal(
      report.balances.branch.find(
        (row) => row.address.toLowerCase() === address,
      ).earnedCreditUnits,
      "50",
    );
  assert.equal(
    state.contributions.find((c) => c.id === report.openGraph.contribution)
      .settlementVerified,
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(report) + JSON.stringify(publicGraph),
    /PRIVATE KEY/,
  );
});

test("maximum funded-receipt bound and one-unit supply preserve accrual without arithmetic overflow", async () => {
  const c = await fixture();
  try {
    const limit = (1n << 80n) - 1n;
    const tiny = await c.create(
      c.factory,
      policy(await c.verifier.getAddress(), await c.payment.getAddress(), {
        name: "Boundary",
        maxSupply: limit,
        maxAward: limit,
      }),
      [[c.addresses[0], 1n]],
    );
    await fund(c, tiny, limit);
    assert.equal(await tiny.withdrawable(c.addresses[0]), limit);
    const p = plan([[c.addresses[2], 10000]]);
    await award(
      c,
      tiny,
      c.signers[2],
      await claimFor(tiny, c.signers[2], c.workId, p),
      p,
      c.proof,
    );
    assert.equal(await tiny.withdrawable(c.addresses[2]), 0n);
    assert.equal(await tiny.withdrawable(c.addresses[0]), limit);
    await assert.rejects(fund(c, tiny, 1n), /revenue cap/);
    await c.record("withdraw boundary accrual", tiny.withdrawRevenue());
    assert.equal(await c.payment.balanceOf(await tiny.getAddress()), 0n);
    await assert.rejects(
      c.create(
        c.factory,
        policy(await c.verifier.getAddress(), await c.payment.getAddress(), {
          maxSupply: limit + 1n,
        }),
      ),
      /limits/,
    );
  } finally {
    await c.close();
  }
});

test("maximum thirty-two reviewer quorum can verify and settle its full ABI proof", async () => {
  const c = await quorumFixture();
  try {
    const reviewers = Array.from({ length: 32 }, () => Wallet.createRandom());
    const addresses = reviewers
      .map((reviewer) => reviewer.address)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    const verifier = await c.makeVerifier(c.factory, "quorum", [addresses, 32]);
    const project = await c.create(
      c.factory,
      policy(await verifier.getAddress(), await c.payment.getAddress(), {
        appealVerifier: await c.appeal.getAddress(),
        settlementDelay: 60,
        appealTimeout: 120,
        challengeBond: 50,
      }),
    );
    const p = plan([[c.addresses[2], 10000]]);
    const claim = await claimFor(
      project,
      c.signers[2],
      hash("maximum reviewer proof"),
      p,
    );
    const proof = await attest(project, verifier, claim, reviewers);
    assert.equal((proof.length - 2) / 2, 5184);
    assert.equal(
      await verifier.verify(await project.getAddress(), claim, proof),
      claim.workId,
    );
    await award(c, project, c.signers[2], claim, p, proof);
    await advance(c, 61);
    await c.record(
      "finalize thirty-two-signature claim",
      project.finalize(claim.workId, p),
    );
    assert.equal(await project.earnedCredit(c.addresses[2]), 100n);
  } finally {
    await c.close();
  }
});

test("cumulative source entitlement is invariant to tiny deposit fragmentation and fee endpoints", async () => {
  const c = await fixture();
  try {
    const makeBranch = (name, sourceFeeBps) =>
      c.create(
        c.factory,
        policy(c.verifier.target, c.payment.target, {
          name,
          sourceProject: c.project.target,
          sourceFeeBps,
        }),
        [[c.addresses[1], 9900n]],
      );
    const bulk = await makeBranch("Bulk receipts", 2000);
    const split = await makeBranch("Split receipts", 2000);
    await fund(c, bulk, 13n);
    assert.equal(await bulk.totalSourceFees(), 2n);
    for (let i = 1; i <= 13; i++) {
      await fund(c, split, 1n);
      assert.equal(
        await split.totalSourceFees(),
        (BigInt(i) * 2000n) / 10000n,
        `source dust crossing at gross ${i}`,
      );
      assert.equal(
        (await split.totalRevenue()) + (await split.totalSourceFees()),
        BigInt(i),
      );
    }
    assert.equal(await split.totalSourceFees(), await bulk.totalSourceFees());
    assert.equal(await split.totalRevenue(), 11n);
    assert.equal(await bulk.totalRevenue(), 11n);
    assert.equal(await c.project.totalRevenue(), 4n);
    assert.equal(await c.payment.balanceOf(split.target), 11n);
    assert.equal(await c.payment.balanceOf(bulk.target), 11n);
    assert.equal(await c.payment.balanceOf(c.project.target), 4n);
    const mixed = await makeBranch("Mixed receipt sizes", 2000);
    for (const amount of [2n, 3n, 1n, 7n]) await fund(c, mixed, amount);
    assert.equal(await mixed.totalSourceFees(), 2n);
    assert.equal(await mixed.totalRevenue(), 11n);
    assert.equal(await c.payment.balanceOf(mixed.target), 11n);
    assert.equal(await c.project.totalRevenue(), 6n);
    const zero = await makeBranch("Zero source fee", 0);
    const full = await makeBranch("All receipts to source", 10000);
    for (const branch of [zero, full]) {
      await fund(c, branch, 1n);
      await fund(c, branch, 1n);
    }
    assert.equal(await zero.totalRevenue(), 2n);
    assert.equal(await zero.totalSourceFees(), 0n);
    assert.equal(await full.totalRevenue(), 0n);
    assert.equal(await full.totalSourceFees(), 2n);
    assert.equal(await c.payment.balanceOf(full.target), 0n);
    assert.equal(await c.project.totalRevenue(), 8n);
  } finally {
    await c.close();
  }
});

test("source forwarding failure rolls back the entire funded deposit and cumulative fee", async () => {
  const c = await fixture();
  try {
    const limit = (1n << 80n) - 1n;
    await fund(c, c.project, limit);
    const branch = await c.create(
      c.factory,
      policy(c.verifier.target, c.payment.target, {
        sourceProject: c.project.target,
        sourceFeeBps: 2000,
      }),
    );
    await assert.rejects(fund(c, branch, 5n), /revenue cap/);
    assert.equal(await branch.totalRevenue(), 0n);
    assert.equal(await branch.totalSourceFees(), 0n);
    assert.equal(await c.payment.balanceOf(branch.target), 0n);
    assert.equal(await c.payment.balanceOf(c.project.target), limit);
    assert.equal(await c.project.totalRevenue(), limit);
    assert.equal(await c.payment.balanceOf(c.addresses[0]), 5n);
  } finally {
    await c.close();
  }
});
