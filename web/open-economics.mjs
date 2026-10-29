export function integer(value, label = "Amount") {
  if (!/^\d{1,30}$/.test(String(value)))
    throw Error(label + " must be a nonnegative whole integer (max 30 digits)");
  return BigInt(value);
}
export function simulate({ supply, rate, awards, revenue, fee }) {
  let total = integer(supply, "Supply");
  const r = integer(rate, "Rate"),
    n = integer(awards, "Awards"),
    income = integer(revenue, "Revenue"),
    f = integer(fee, "Source fee");
  if (total === 0n || r === 0n || r > 1000n || n > 100n || f > 10000n)
    throw Error(
      "Supply > 0; award rate 1–1000 bps; awards ≤ 100; source fee ≤ 10000 bps",
    );
  const initial = total;
  let minted = 0n;
  const rows = [];
  for (let i = 0n; i < n; i++) {
    const mint = (total * r + (10000n - r) - 1n) / (10000n - r);
    total += mint;
    minted += mint;
    rows.push({ award: i + 1n, mint, total });
  }
  const source = (income * f) / 10000n;
  const branch = income - source;
  const originalPayout = (branch * initial) / total;
  const newPayout = (branch * minted) / total;
  return {
    initial,
    total,
    minted,
    rows,
    source,
    branch,
    originalPayout,
    newPayout,
    remainder: branch - originalPayout - newPayout,
    originalBps: (initial * 10000n) / total,
  };
}
