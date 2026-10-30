import { createHardhatRuntimeEnvironment } from "hardhat/hre";
import {
  BrowserProvider,
  ContractFactory,
  Contract,
  AbiCoder,
  keccak256,
  toUtf8Bytes,
  ZeroAddress,
  ZeroHash,
} from "ethers";
import config from "../hardhat.config.js";
import { compile, root } from "./compile.mjs";
let artifacts;
export const hash = (text) => keccak256(toUtf8Bytes(text));
export const abi = AbiCoder.defaultAbiCoder();
export { ZeroAddress, ZeroHash };
export async function chain() {
  artifacts ??= compile();
  const hre = await createHardhatRuntimeEnvironment(config, {}, root);
  const connection = await hre.network.create("local");
  const provider = new BrowserProvider(connection.provider, undefined, {
    cacheTimeout: -1,
  });
  provider.pollingInterval = 10;
  const signers = await Promise.all(
    Array.from({ length: 10 }, (_, i) => provider.getSigner(i)),
  );
  const addresses = await Promise.all(signers.map((s) => s.getAddress()));
  const transactions = [];
  const record = async (label, tx) => {
    const receipt = await (await tx).wait();
    if (receipt.status !== 1) throw Error(`${label} reverted`);
    transactions.push({
      label,
      hash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      from: receipt.from,
      to: receipt.to,
      contractAddress: receipt.contractAddress,
      status: "success",
      gasUsed: receipt.gasUsed.toString(),
    });
    return receipt;
  };
  const deploy = async (name, args = [], signer = signers[0]) => {
    const artifact = artifacts[name];
    const contract = await new ContractFactory(
      artifact.abi,
      artifact.bytecode,
      signer,
    ).deploy(...args);
    await record(`deploy ${name}`, contract.deploymentTransaction());
    return contract;
  };
  const at = (name, address, signer = signers[0]) =>
    new Contract(address, artifacts[name].abi, signer);
  const makeVerifier = async (factory, kind, args) => {
    const registry = at("VerifierFactory", await factory.verifierFactory());
    const receipt = await record(
      `create ${kind} verifier`,
      registry[kind === "objective" ? "createPreimage" : "createQuorum"](
        ...args,
      ),
    );
    const event = receipt.logs
      .map((log) => {
        try {
          return registry.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "VerifierCreated");
    return at(
      kind === "objective" ? "PreimageVerifier" : "QuorumVerifier",
      event.args.verifier,
    );
  };
  const create = async (
    factory,
    policy,
    allocation = [[addresses[0], 9900n]],
    signer = signers[0],
  ) => {
    allocation = allocation.toSorted((a, b) =>
      a[0].toLowerCase().localeCompare(b[0].toLowerCase()),
    );
    const receipt = await record(
      `create ${policy.name}`,
      factory.connect(signer).create(
        policy,
        allocation.map((x) => x[0]),
        allocation.map((x) => x[1]),
      ),
    );
    const event = receipt.logs
      .map((log) => {
        try {
          return factory.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "ProjectCreated");
    return at("Project", event.args.project);
  };
  return {
    provider,
    connection,
    signers,
    addresses,
    record,
    deploy,
    at,
    create,
    makeVerifier,
    transactions,
    close: () => connection.close(),
  };
}
export function policy(verifier, paymentAsset, extra = {}) {
  return {
    name: "Local project",
    symbol: "LOCAL",
    termsHash: hash("agreed terms"),
    criteriaHash: hash("criteria"),
    verifier,
    paymentAsset,
    sourceProject: ZeroAddress,
    sourceFeeBps: 0,
    rewardBps: 100,
    maxSupply: 1000000n,
    maxAward: 100000n,
    maxAwards: 100,
    appealVerifier: ZeroAddress,
    settlementDelay: 0,
    appealTimeout: 0,
    challengeBond: 0,
    ...extra,
  };
}
export function plan(entries) {
  entries = entries.toSorted((a, b) =>
    a[0].toLowerCase().localeCompare(b[0].toLowerCase()),
  );
  const recipients = entries.map((x) => x[0]),
    weights = entries.map((x) => x[1]);
  return { recipients, weights };
}
export function planHash(p) {
  return keccak256(
    abi.encode(["address[]", "uint16[]"], [p.recipients, p.weights]),
  );
}
export async function claimFor(project, actor, workId, p, extra = {}) {
  const address = await actor.getAddress();
  return {
    principal: address,
    actor: address,
    evidence: hash("educational seed task answer"),
    workId,
    creditHash: planHash(p),
    ...extra,
  };
}
export async function award(
  c,
  project,
  actor,
  claim,
  p,
  proof,
  salt = hash("private salt"),
) {
  const connected = project.connect(actor);
  const commitment = await connected.commitmentHash(claim, proof, salt);
  await c.record("commit contribution", connected.commit(commitment));
  return c.record(
    "reveal contribution",
    connected.reveal(claim, p, proof, salt),
  );
}
export const reviewTypes = {
  Review: [
    { name: "project", type: "address" },
    { name: "principal", type: "address" },
    { name: "actor", type: "address" },
    { name: "evidence", type: "bytes32" },
    { name: "workId", type: "bytes32" },
    { name: "creditHash", type: "bytes32" },
    { name: "termsHash", type: "bytes32" },
    { name: "criteriaHash", type: "bytes32" },
    { name: "rewardPolicyHash", type: "bytes32" },
  ],
};
export async function attest(
  project,
  verifier,
  claim,
  reviewers,
  overrides = {},
) {
  const domain = {
    name: "KoinosReview",
    version: "1",
    chainId: 31337,
    verifyingContract: await verifier.getAddress(),
    ...overrides,
  };
  const value = {
    project: await project.getAddress(),
    principal: claim.principal,
    actor: claim.actor,
    evidence: claim.evidence,
    workId: claim.workId,
    creditHash: claim.creditHash,
    termsHash: await project.termsHash(),
    criteriaHash: await project.criteriaHash(),
    rewardPolicyHash: await project.rewardPolicyHash(),
  };
  const signatures = await Promise.all(
    reviewers.map(async (signer) => ({
      address: (await signer.getAddress()).toLowerCase(),
      signature: await signer.signTypedData(domain, reviewTypes, value),
    })),
  );
  signatures.sort((a, b) => a.address.localeCompare(b.address));
  return abi.encode(["bytes[]"], [signatures.map((x) => x.signature)]);
}
export async function advance(c, seconds) {
  await c.connection.provider.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
  await c.connection.provider.request({ method: "evm_mine", params: [] });
}
export { root };
