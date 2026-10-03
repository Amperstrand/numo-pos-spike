/**
 * POST /api/mint/quote — create a NUT-04 mint quote at the mock Cashu mint.
 *
 * Body:  { amountSats: number, basketId?: string }
 * Returns: { quote, request, amountSats, unit, state, expiry }
 *
 * In production this call would go to `${mintUrl}/v1/mint/quote/bolt11`.
 */
import { NextRequest, NextResponse } from "next/server";
import { createMintQuote } from "@/lib/mock-mint";
import * as testnut from "@/lib/testnut-mint";

export const dynamic = "force-dynamic";

/** TESTNUT_MINT=1 → real testnut.cashu.space quotes; default → mock mint. */
const useTestnut = process.env.TESTNUT_MINT === "1";

export async function POST(req: NextRequest) {
  let body: { amountSats?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const amountSats = Number(body.amountSats);
  if (!Number.isInteger(amountSats) || amountSats <= 0) {
    return NextResponse.json(
      { error: "amountSats must be a positive integer" },
      { status: 400 }
    );
  }

  if (useTestnut) {
    try {
      const q = await testnut.createMintQuote(amountSats);
      return NextResponse.json({ ...q, mintUrl: testnut.MINT_URL, mintMode: "testnut" });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "testnut quote failed" },
        { status: 502 },
      );
    }
  }

  const quote = createMintQuote(amountSats);

  return NextResponse.json({
    quote: quote.quote,
    request: quote.request,
    amountSats: quote.amountSats,
    unit: quote.unit,
    state: quote.state,
    expiry: quote.expiry,
    // Mint URL we present to the POS for display purposes.
    mintUrl: "https://mint.numo-spike.local/cashu-bitcoin",
    mintMode: "mock",
  });
}
