/**
 * POST /api/mint/pay — simulate the customer paying the Lightning invoice
 * attached to a NUT-04 quote.
 *
 * In production the customer pays the BOLT11 invoice with their Lightning
 * wallet out-of-band; the mint observes settlement and THEN mints ecash
 * proofs in response to a blind-signature request from the wallet. For
 * the spike we collapse both steps into one "I paid" call.
 *
 * Body:  { quote: string }
 * Returns: { quote, proofs, token }
 */
import { NextRequest, NextResponse } from "next/server";
import { payQuote, encodeProofsAsCashuToken } from "@/lib/mock-mint";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { quote?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.quote) {
    return NextResponse.json({ error: "missing quote" }, { status: 400 });
  }

  try {
    const { quote, proofs } = payQuote(body.quote);
    const token = encodeProofsAsCashuToken(proofs);
    return NextResponse.json({
      quote: quote.quote,
      state: quote.state,
      paidAt: quote.paidAt,
      proofs,
      token,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "pay failed" },
      { status: 400 }
    );
  }
}
