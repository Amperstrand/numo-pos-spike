/**
 * Real Cashu mint backed by https://testnut.cashu.space (test mint — quotes
 * auto-settle in seconds, never real value). API-compatible with mock-mint so
 * the /api/mint routes switch backends with one env (TESTNUT_MINT=1).
 */
import { Wallet, getEncodedTokenV4, type Proof } from "@cashu/cashu-ts";

export const MINT_URL = "https://testnut.cashu.space";

const g = globalThis as unknown as { __testnutWallet?: Wallet };
async function wallet(): Promise<Wallet> {
  if (!g.__testnutWallet) {
    const w = new Wallet(MINT_URL);
    await w.loadMint();
    g.__testnutWallet = w;
  }
  return g.__testnutWallet;
}

export async function createMintQuote(amountSats: number) {
  const w = await wallet();
  const q = await w.createMintQuote(amountSats);
  return {
    quote: q.quote,
    request: q.request,
    amountSats,
    unit: "sat" as const,
    state: (q.state ?? "UNPAID") as string,
    expiry: q.expiry ?? Date.now() + 17 * 60_000,
  };
}

/**
 * The "customer payment": testnut settles mint quotes automatically
 * (~3 s), so we poll until PAID and then mint the ecash proofs —
 * exactly the blind-signature flow a wallet runs after paying an invoice.
 */
export async function payQuote(quoteId: string) {
  const w = await wallet();
  let state = "UNPAID";
  let amount = 0;
  for (let i = 0; i < 20; i++) {
    const check = await w.checkMintQuote(quoteId);
    state = check.state;
    amount = Number(check.amount ?? 0);
    if (state === "PAID") break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (state !== "PAID") throw new Error(`quote not settled (state=${state})`);
  const proofs = await w.mintProofs(amount, quoteId);
  return {
    quote: quoteId,
    state: "PAID" as const,
    paidAt: new Date().toISOString(),
    proofs,
  };
}

/**
 * NUT-07 spendability check via the mint's /v1/checkstate. CDK mints take
 * `{Ys: [proof C values]}` and answer per-Y UNSPENT/SPENT/PENDING.
 */
export async function verifyProofs(proofs: Proof[]) {
  const response = await fetch(`${MINT_URL}/v1/checkstate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ Ys: proofs.map((p) => p.C) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`mint /v1/checkstate ${response.status}`);
  const value = (await response.json()) as { states?: Array<{ Y: string; state: string }> };
  const states = value.states ?? [];
  const byY = new Map(states.map((s) => [s.Y, s.state]));
  const spent = proofs.filter((p) => byY.get(p.C) === "SPENT").map((p) => p.secret);
  const totalSats = proofs.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return { ok: spent.length === 0 && totalSats > 0, totalSats, spent };
}

export function encodeProofsAsCashuToken(proofs: Proof[]): string {
  return getEncodedTokenV4({ mint: MINT_URL, unit: "sat", proofs });
}
