export function truncatePubkey(pk: string, head = 5, tail = 4): string {
  if (pk.length <= head + tail + 1) return pk;
  return `${pk.slice(0, head)}…${pk.slice(-tail)}`;
}

export function lamportsToSolStr(lamports: number | bigint, digits = 4): string {
  const n = typeof lamports === 'bigint' ? Number(lamports) : lamports;
  return (n / 1_000_000_000).toFixed(digits);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
