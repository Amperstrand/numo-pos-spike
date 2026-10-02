/**
 * PATCH /api/kitchen/orders/[id] — advance an order's status.
 *
 * Body: { status: "NEW" | "PREPARING" | "READY" | "PICKED_UP" }
 *
 * After persisting, broadcasts a `kitchen:order:update` Socket.io event so
 * every kitchen-display client refreshes instantly.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { broadcastKitchenEvent } from "@/lib/kitchen-events";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["NEW", "PREPARING", "READY", "PICKED_UP"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const order = await db.order.update({
    where: { id },
    data: { status: body.status },
    include: { items: true },
  });

  await broadcastKitchenEvent("kitchen:order:update", {
    id: order.id,
    status: order.status,
    updatedAt: order.updatedAt.toISOString(),
  });

  return NextResponse.json({
    ok: true,
    id: order.id,
    status: order.status,
  });
}
