/**
 * POST /api/kitchen/tickets — bridge-facing ticket ingestion.
 *
 * The numo bridge's SocketKitchenChannel posts submitted provider orders
 * here so they BOTH persist (kitchen list survives refresh) and broadcast
 * (live Socket.io update). Distinct from /api/webhooks/numo: no payment
 * processing, no bridge-forward (the order already came from the bridge —
 * posting it back would loop), idempotent on the caller's order id.
 *
 * Body: { id, status?, totalSats, totalCents, currency?, paymentId?,
 *         basketId?, createdAt?, items: [{menuItemId, name, quantity,
 *         unitSats, totalSats}] }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { broadcastKitchenEvent } from "@/lib/kitchen-events";

export const dynamic = "force-dynamic";

interface TicketBody {
  id?: string;
  status?: string;
  totalSats?: number;
  totalCents?: number;
  currency?: string;
  paymentId?: string;
  basketId?: string;
  createdAt?: string;
  items?: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    unitSats?: number;
    totalSats?: number;
  }>;
}

export async function POST(req: NextRequest) {
  let body: TicketBody;
  try {
    body = (await req.json()) as TicketBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const items = body.items ?? [];
  if (!body.id || items.length === 0 || !body.totalSats || !body.totalCents) {
    return NextResponse.json({ error: "id, totalSats, totalCents and items are required" }, { status: 400 });
  }

  // idempotent: a re-broadcast of the same order must not double-ticket
  const existing = await db.order.findFirst({ where: { paymentId: body.id } });
  if (existing) {
    return NextResponse.json({ ok: true, orderId: existing.id, deduped: true });
  }

  const unitCents = Math.round(body.totalCents / items.reduce((s, i) => s + i.quantity, 0));
  const order = await db.order.create({
    data: {
      status: body.status ?? "NEW",
      totalSats: body.totalSats,
      totalCents: body.totalCents,
      paymentId: body.id,
      basketId: body.basketId ?? "bridge",
      currency: body.currency ?? "EUR",
      ...(body.createdAt ? { createdAt: new Date(body.createdAt) } : {}),
      items: {
        create: items.map((i) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          quantity: i.quantity,
          unitSats: i.unitSats ?? body.totalSats!,
          unitCents,
          totalSats: i.totalSats ?? (i.unitSats ?? body.totalSats!) * i.quantity,
          totalCents: Math.round(
            ((i.totalSats ?? (i.unitSats ?? body.totalSats!) * i.quantity) / body.totalSats!) * body.totalCents!,
          ),
        })),
      },
    },
    include: { items: true },
  });

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

  return NextResponse.json({ ok: true, orderId: order.id });
}
