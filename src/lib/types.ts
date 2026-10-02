/**
 * Shared client-side types for the POS UI.
 */

export interface MenuItemDTO {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  priceSats: number;
  emoji: string;
  available: boolean;
}

export interface RestaurantMenuResponse {
  restaurant: {
    name: string;
    currency: string;
    vatRate: number;
    bitcoinPriceEur: number;
  };
  categories: string[];
  menu: Record<string, MenuItemDTO[]>;
  itemCount: number;
  generatedAt: string;
}

export interface CartLine {
  item: MenuItemDTO;
  quantity: number;
}

export interface KitchenOrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitSats: number;
  totalSats: number;
}

export interface KitchenOrder {
  id: string;
  status: "NEW" | "PREPARING" | "READY" | "PICKED_UP";
  totalSats: number;
  totalCents: number;
  currency: string;
  paymentId?: string | null;
  basketId?: string | null;
  createdAt: string;
  updatedAt?: string;
  items: KitchenOrderItem[];
}

/** Format EUR cents as a € string. */
export function formatEur(cents: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

/** Format sats with thousands separators. */
export function formatSats(sats: number): string {
  return `${new Intl.NumberFormat("en-US").format(sats)} sat`;
}
