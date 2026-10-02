/**
 * Mock Cashu mint — a tiny in-memory implementation of the bits of the
 * Cashu (NUT-04 / NUT-05 / NUT-17) protocol the spike needs.
 *
 * This stands in for a real mintd / BTCPay+Cashu-plugin instance during
 * the hackathon. In production the same calls would go to an actual mint
 * URL (see SPIKE_MINT_URL — the demo configures Numo to use a fake host).
 *
 * The flow we simulate:
 *   1. POS creates a NUT-04 mint quote  → /api/mint/quote
 *   2. Customer "pays" the Lightning invoice (we auto-pay it) → /api/mint/pay
 *   3. POS verifies the resulting proofs → /api/mint/verify
 *
 * State lives in module scope and survives across hot reloads within a
 * single Next.js dev server process.
 */
import { randomBytes } from "node:crypto";

/** NUT-04 mint quote — what the mint returns when asked to issue ecash. */
export interface MockMintQuote {
  quote: string; // unique quote id
  request: string; // BOLT11-looking string (mock)
  amountSats: number;
  unit: string; // "sat"
  state: "UNPAID" | "PAID";
  createdAt: number;
  paidAt?: number;
  expiry: number; // ms epoch
}

/** Cashu "proof" — a signed token that proves the holder owns N sats. */
export interface MockProof {
  amount: number;
  id: string; // keyset id
  secret: string; // hex
  C: string; // hex commitment
}

/** Keyset the mock mint claims to use. */
const KEYSET_ID = "spike_001";

// ─── In-memory store ───────────────────────────────────────────────────────
const quotes = new Map<string, MockMintQuote>();
const paidQuotes = new Set<string>(); // quote ids that have been paid
const spentProofs = new Set<string>(); // proof secrets we've already seen

/**
 * Create a NUT-04 mint quote (Lightning → Cashu swap-in).
 *
 * Real Cashu response shape (NUT-04):
 *   { quote, request, amount, unit, state, expiry }
 */
export function createMintQuote(amountSats: number): MockMintQuote {
  const now = Date.now();
  const quote: MockMintQuote = {
    quote: `q_${randomBytes(8).toString("hex")}`,
    // Mock BOLT11 invoice — a real Numo would show this as a QR / NDEF URI.
    request: `lnbc${amountSats}0n1pspike${randomBytes(20).toString("hex")}`,
    amountSats,
    unit: "sat",
    state: "UNPAID",
    createdAt: now,
    expiry: now + 5 * 60_000, // 5-minute window
  };
  quotes.set(quote.quote, quote);
  return quote;
}

export function getMintQuote(quoteId: string): MockMintQuote | undefined {
  return quotes.get(quoteId);
}

/**
 * Simulate the customer paying the Lightning invoice and the mint then
 * issuing ecash proofs for the paid amount (NUT-04 /mint endpoint).
 *
 * In a real Cashu flow the customer pays the BOLT11 invoice externally
 * (e.g. via Lightning wallet); the mint observes the payment and only
 * THEN mints proofs in response to a blind signature request. For the
 * spike we collapse these two steps into one "I paid" call.
 */
export function payQuote(quoteId: string): {
  quote: MockMintQuote;
  proofs: MockProof[];
} {
  const q = quotes.get(quoteId);
  if (!q) throw new Error(`Unknown quote ${quoteId}`);
  if (q.state === "PAID") throw new Error(`Quote ${quoteId} already paid`);
  if (Date.now() > q.expiry) throw new Error(`Quote ${quoteId} expired`);

  // Mint proofs. Real Cashu splits into denominations; we do a single
  // denomination equal to the full amount for simplicity.
  const proofs: MockProof[] = [
    {
      amount: q.amountSats,
      id: KEYSET_ID,
      secret: randomBytes(32).toString("hex"),
      C: randomBytes(32).toString("hex"),
    },
  ];

  q.state = "PAID";
  q.paidAt = Date.now();
  paidQuotes.add(quoteId);
  return { quote: q, proofs };
}

/**
 * Verify a set of proofs (NUT-05 /melt or /check).
 *
 * For the spike: a proof is valid iff it was issued by this mock and
 * has not been spent yet.
 *
 * Returns the total verified amount and marks the proofs spent so they
 * can't be double-spent in a second order.
 */
export function verifyProofs(proofs: MockProof[]): {
  ok: boolean;
  totalSats: number;
  spent: string[];
} {
  let totalSats = 0;
  const spent: string[] = [];

  for (const p of proofs) {
    if (p.id !== KEYSET_ID) continue;
    if (spentProofs.has(p.secret)) continue;
    spentProofs.add(p.secret);
    spent.push(p.secret);
    totalSats += p.amount;
  }

  return { ok: totalSats > 0, totalSats, spent };
}

/**
 * Encode proofs into a Cashu token string. Real Cashu tokens are
 * `cashuA...` / `cashuB...` Bech32-encoded blobs. We produce a
 * short string that LOOKS like a real Cashu token for display in
 * the payment modal — purely cosmetic.
 */
export function encodeProofsAsCashuToken(proofs: MockProof[]): string {
  const payload = JSON.stringify({
    mint: "https://mint.numo-spike.local/cashu-bitcoin",
    proofs: proofs.map((p) => ({ a: p.amount, s: p.secret, c: p.C, i: p.id })),
    unit: "sat",
  });
  return `cashuA${Buffer.from(payload).toString("base64url").slice(0, 96)}`;
}

/** Pretty-print a mock BOLT11 invoice for QR display. */
export function formatBolt11Request(quote: MockMintQuote): string {
  // Real invoices are 200+ chars; we truncate to fit a QR nicely.
  return `${quote.request}`.slice(0, 200);
}
