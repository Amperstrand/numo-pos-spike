/**
 * Legacy restaurant API — represents the existing back-office system
 * that already exports its product catalogue as JSON.
 *
 * GET /api/restaurant/menu → returns the full menu grouped by category.
 *
 * This is what Numo would call to display products on its POS screen.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await db.menuItem.findMany({
    where: { available: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Group by category for nicer POS UI.
  const byCategory = items.reduce<
    Record<string, typeof items>
  >((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return NextResponse.json({
    restaurant: {
      name: "Trattoria Numo",
      currency: "EUR",
      vatRate: 25,
      bitcoinPriceEur: 60_000,
    },
    categories: Object.keys(byCategory),
    menu: byCategory,
    itemCount: items.length,
    // Mirror the kind of meta-info a legacy POS would include.
    generatedAt: new Date().toISOString(),
  });
}
