/**
 * POST /api/mint/verify — verify Cashu proofs and mark them spent.
 *
 * Body:  { proofs: Array<{ amount, id, secret, C }> }
 * Returns: { ok, totalSats, spent }
 *
 * In production this would call `${mintUrl}/v1/verify` (NUT-07 style).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyProofs, type MockProof } from "@/lib/mock-mint";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { proofs?: MockProof[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.proofs) || body.proofs.length === 0) {
    return NextResponse.json({ error: "missing proofs" }, { status: 400 });
  }

  const result = verifyProofs(body.proofs);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: "no valid proofs" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    totalSats: result.totalSats,
    spent: result.spent,
  });
}
