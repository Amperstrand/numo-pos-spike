import type { NumoCheckoutLineItem } from "@/lib/numo-webhook";

export interface KitchenOrderItemCreate {
  menuItemId: string;
  name: string;
  quantity: number;
  unitSats: number;
  unitCents: number;
  totalSats: number;
  totalCents: number;
}

/**
 * Numo webhook line item → kitchen OrderItem create payload.
 *
 * Real Numo payloads carry a per-item UUID in `itemId`; the merchant catalog
 * SKU (Numo CSV "SKU" column) is what matches the seeded menu, so sku wins.
 * Optional integer fields are defaulted to 0 — Prisma rejects undefined.
 */
export function toKitchenItems(items: NumoCheckoutLineItem[]): KitchenOrderItemCreate[] {
  return items.map((it) => ({
    menuItemId: it.sku ?? it.itemId ?? "",
    name: it.name ?? "",
    quantity: it.quantity ?? 0,
    unitSats: it.priceSats ?? 0,
    unitCents: it.netPriceCents ?? 0,
    totalSats: it.netTotalSats ?? 0,
    totalCents: it.netTotalCents ?? 0,
  }));
}
