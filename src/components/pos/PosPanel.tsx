"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart-store";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Utensils } from "lucide-react";
import { MenuItemCard } from "./MenuItemCard";
import { Cart } from "./Cart";
import { PaymentModal } from "./PaymentModal";
import type { RestaurantMenuResponse, MenuItemDTO } from "@/lib/types";

interface Props {
  onPaid: () => void;
}

export function PosPanel({ onPaid }: Props) {
  const [data, setData] = useState<RestaurantMenuResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [payOpen, setPayOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/restaurant/menu");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: RestaurantMenuResponse = await res.json();
        setData(json);
        useCart.getState().setVatRate(json.restaurant.vatRate);
      } catch (e) {
        setError(e instanceof Error ? e.message : "unknown");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = data ? ["All", ...data.categories] : ["All"];

  const filteredItems: MenuItemDTO[] = (() => {
    if (!data) return [];
    const all: MenuItemDTO[] = Object.values(data.menu).flat();
    return all.filter((item) => {
      if (activeCategory !== "All" && item.category !== activeCategory) {
        return false;
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  })();

  return (
    <div className="flex h-full">
      {/* ─── Menu (left, takes 2/3 of POS area) ─────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 border-r">
        <div className="px-4 py-3 border-b space-y-2 bg-background">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Utensils className="h-4 w-4" />
              <h1 className="font-semibold text-base">
                {data?.restaurant.name ?? "Loading…"}
              </h1>
            </div>
            {data && (
              <div className="text-[10px] text-muted-foreground hidden sm:block">
                {data.restaurant.vatRate}% VAT · 1 BTC = €
                {data.restaurant.bitcoinPriceEur.toLocaleString()}
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the menu…"
              className="pl-8 h-9"
              disabled={loading}
            />
          </div>
          {/* Category chips */}
          {!loading && data && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setActiveCategory(c)}
                  className={
                    "text-xs px-2.5 py-1 rounded-full border transition-colors " +
                    (activeCategory === c
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:bg-accent")
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center text-sm text-destructive py-8">
                Failed to load menu: {error}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No items match your search
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredItems.map((item) => (
                  <MenuItemCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ─── Cart (right, fixed width) ─────────────────────────────── */}
      <div className="w-[340px] flex-shrink-0 bg-background flex flex-col">
        <Cart onCheckout={() => setPayOpen(true)} />
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onPaid={() => onPaid()}
      />
    </div>
  );
}
