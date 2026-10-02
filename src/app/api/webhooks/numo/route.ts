/**
 * POST /api/webhooks/numo — Numo `payment.received` (v2) webhook receiver.
 *
 * This is the endpoint a real Numo Android terminal would POST to after
 * a successful Cashu / Lightning payment. Numo sends:
 *   Authorization: <configured-auth-key>  (optional, configured per-endpoint)
 *   Content-Type:  application/json
 *   Body:          NumoPaymentReceivedWebhookV2 (see src/lib/numo-webhook.ts)
 *
 * The handler:
 *   1. Validates the auth key (if configured).
 *   2. Normalises the payload:
 *        - If the body is a *full* Numo v2 webhook (has `payment` + `checkout`),
 *          use it verbatim — this is the production contract.
 *        - If the body is the *simplified* POS shape used by this spike's
 *          frontend ({ paymentId, amountSats, basketId, lineItems }), build
 *          the full v2 payload via buildNumoPaymentReceivedWebhook so the
 *          rest of the handler is contract-pure.
 *   3. Validates event / payloadVersion / status.
 *   4. Persists a kitchen order + line items.
 *   5. Broadcasts a `kitchen:order:new` Socket.io event.
 *   6. Returns the order id so the POS can show a confirmation.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { broadcastKitchenEvent } from "@/lib/kitchen-events";
import {
  type NumoPaymentReceivedWebhookV2,
  type NumoCheckoutLineItem,
  buildNumoPaymentReceivedWebhook,
} from "@/lib/numo-webhook";

export const dynamic = "force-dynamic";

// Bearer-style or raw key — Numo is permissive about the prefix.
const EXPECTED_AUTH = process.env.NUMO_WEBHOOK_AUTH_KEY;

/** Simplified payload the POS frontend sends after payment is verified. */
interface SimplifiedPosWebhook {
  event?: "payment.received";
  payloadVersion?: 2;
  paymentId: string;
  amountSats: number;
  basketId: string;
  lineItems: Array<{
    itemId: string;
    name: string;
    category: string;
    quantity: number;
    netPriceCents: number;
    priceSats: number;
  }>;
  currency?: string;
}

function isFullV2Payload(
  body: unknown
): body is NumoPaymentReceivedWebhookV2 {
  return (
    !!body &&
    typeof body === "object" &&
    "event" in body &&
    "payloadVersion" in body &&
    "payment" in body &&
    "checkout" in body
  );
}

function isSimplifiedPayload(body: unknown): body is SimplifiedPosWebhook {
  return (
    !!body &&
    typeof body === "object" &&
    "paymentId" in body &&
    "amountSats" in body &&
    "basketId" in body &&
    "lineItems" in body
  );
}

export async function POST(req: NextRequest) {
  // ─── 1. Auth (skip if no key configured) ────────────────────────────────
  if (EXPECTED_AUTH) {
    const auth = req.headers.get("authorization") ?? "";
    const got = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (got !== EXPECTED_AUTH) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // ─── 2. Parse + normalise ──────────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  let payload: NumoPaymentReceivedWebhookV2;

  if (isFullV2Payload(raw)) {
    // Real Numo terminal — use as-is.
    payload = raw;
  } else if (isSimplifiedPayload(raw)) {
    // POS spike frontend — fabricate the full Numo v2 payload so the
    // downstream handler can stay contract-pure. This is exactly the
    // shape Numo would have sent in production.
    payload = buildNumoPaymentReceivedWebhook({
      paymentId: raw.paymentId,
      amountSats: raw.amountSats,
      basketId: raw.basketId,
      lineItems: raw.lineItems,
      currency: raw.currency,
    });
  } else {
    return NextResponse.json(
      { error: "unrecognised payload shape" },
      { status: 400 }
    );
  }

  // ─── 3. Validate the normalised payload ────────────────────────────────
  if (payload.event !== "payment.received" || payload.payloadVersion !== 2) {
    return NextResponse.json(
      { error: "unsupported event / version" },
      { status: 400 }
    );
  }

  if (payload.payment.status !== "completed") {
    return NextResponse.json(
      { error: `unexpected payment status: ${payload.payment.status}` },
      { status: 400 }
    );
  }

  const checkout = payload.checkout;
  if (!checkout || !Array.isArray(checkout.items)) {
    return NextResponse.json(
      { error: "checkout metadata missing" },
      { status: 400 }
    );
  }

  // ─── 4. Persist the order + line items ─────────────────────────────────
  // Numo retries the webhook (0/1s/2.5s backoff) with the same eventId and
  // paymentId — dedupe on paymentId so a retry never duplicates a ticket.
  const existing = await db.order.findFirst({
    where: { paymentId: payload.payment.paymentId },
    include: { items: true },
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      orderId: existing.id,
      eventId: payload.eventId,
      deduped: true,
    });
  }

  const order = await db.order.create({
    data: {
      status: "NEW",
      totalSats: payload.payment.amountSats,
      totalCents: checkout.fiatGrossTotalCents,
      paymentId: payload.payment.paymentId,
      basketId: checkout.checkoutBasketId,
      currency: checkout.currency,
      items: {
        create: checkout.items.map((it: NumoCheckoutLineItem) => ({
          // Real Numo payloads put a per-item UUID in itemId; the merchant
          // catalog SKU (Numo CSV "SKU" column) is the id that matches the
          // seeded menu — prefer it, fall back to itemId.
          menuItemId: it.sku ?? it.itemId,
          name: it.name,
          quantity: it.quantity,
          unitSats: it.priceSats ?? 0,
          unitCents: it.netPriceCents ?? 0,
          totalSats: it.netTotalSats ?? 0,
          totalCents: it.netTotalCents ?? 0,
        })),
      },
    },
    include: { items: true },
  });

  // ─── 5. Broadcast to kitchen display (best-effort) ─────────────────────
  await broadcastKitchenEvent("kitchen:order:new", {
    id: order.id,
    status: order.status,
    totalSats: order.totalSats,
    totalCents: order.totalCents,
    currency: order.currency,
    paymentId: order.paymentId,
    basketId: order.basketId,
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((i) => ({
      menuItemId: i.menuItemId,
      name: i.name,
      quantity: i.quantity,
      unitSats: i.unitSats,
      totalSats: i.totalSats,
    })),
  });

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    eventId: payload.eventId,
  });
}
