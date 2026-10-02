/**
 * Cart state — Zustand store.
 *
 * Persists to localStorage so a page refresh doesn't lose the basket.
 * One shared cart per browser tab — this is a single-terminal demo.
 */
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { MenuItemDTO } from "./types";
import { VAT_RATE_PERCENT } from "@/lib/restaurant-config";

interface CartState {
  lines: Array<{ item: MenuItemDTO; quantity: number }>;
  /** VAT percent of the seeded venue, hydrated from /api/restaurant/menu */
  vatRate: number;
  setVatRate: (rate: number) => void;
  addItem: (item: MenuItemDTO) => void;
  removeItem: (id: string) => void;
  decrementItem: (id: string) => void;
  clear: () => void;
  setQuantity: (id: string, qty: number) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      vatRate: VAT_RATE_PERCENT,
      setVatRate: (rate) => set({ vatRate: rate }),
      addItem: (item) =>
        set((s) => {
          const existing = s.lines.find((l) => l.item.id === item.id);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.item.id === item.id
                  ? { ...l, quantity: l.quantity + 1 }
                  : l
              ),
            };
          }
          return { lines: [...s.lines, { item, quantity: 1 }] };
        }),
      decrementItem: (id) =>
        set((s) => {
          const existing = s.lines.find((l) => l.item.id === id);
          if (!existing) return s;
          if (existing.quantity <= 1) {
            return { lines: s.lines.filter((l) => l.item.id !== id) };
          }
          return {
            lines: s.lines.map((l) =>
              l.item.id === id ? { ...l, quantity: l.quantity - 1 } : l
            ),
          };
        }),
      removeItem: (id) =>
        set((s) => ({ lines: s.lines.filter((l) => l.item.id !== id) })),
      setQuantity: (id, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.item.id !== id)
              : s.lines.map((l) =>
                  l.item.id === id ? { ...l, quantity: qty } : l
                ),
        })),
      clear: () => set({ lines: [] }),
    }),
    { name: "numo-pos-cart" }
  )
);

export function selectCartTotals(state: CartState) {
  // priceCents is the GROSS venue price (what the venue menu shows), so the
  // cart total equals the venue menu total and VAT is the included portion.
  const grossCents = state.lines.reduce(
    (s, l) => s + l.item.priceCents * l.quantity,
    0
  );
  const totalSats = state.lines.reduce(
    (s, l) => s + l.item.priceSats * l.quantity,
    0
  );
  const vatCents = Math.round(grossCents - grossCents / (1 + state.vatRate / 100));
  const netCents = grossCents - vatCents;
  const itemCount = state.lines.reduce((s, l) => s + l.quantity, 0);
  return { netCents, totalSats, vatCents, grossCents, itemCount };
}

/**
 * Use this hook instead of `useCart(selectCartTotals)` — the latter returns
 * a new object reference every render, which (in Zustand v5 + React 19 +
 * useSyncExternalStore) causes an infinite re-render loop. `useShallow`
 * does a shallow field-by-field comparison so the snapshot only updates
 * when an actual value changes.
 */
export function useCartTotals() {
  return useCart(useShallow(selectCartTotals));
}
