/**
 * GET  /api/kitchen/orders          — list all open orders (NEW | PREPARING)
 * POST /api/kitchen/orders          — manual order creation (NOT the main
 *                                      path; the main path is the Numo webhook)
 *
 * The webhook handler (`/api/webhooks/numo`) is the primary producer of
 * orders; this endpoint exists for the kitchen display to read live state
 * (useful on first page load, before any Socket.io events arrive).
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const where = status ? { status } : { NOT: { status: "PICKED_UP" } };

  const orders = await db.order.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      totalSats: o.totalSats,
      totalCents: o.totalCents,
      currency: o.currency,
      paymentId: o.paymentId,
      basketId: o.basketId,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
      items: o.items.map((i) => ({
        menuItemId: i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        unitSats: i.unitSats,
        totalSats: i.totalSats,
      })),
    })),
  });
}
