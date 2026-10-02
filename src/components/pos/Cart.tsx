"use client";

import { Minus, Plus, Trash2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCart, useCartTotals } from "@/lib/cart-store";
import { formatEur, formatSats } from "@/lib/types";
import { VAT_RATE_PERCENT } from "@/lib/restaurant-config";

interface Props {
  onCheckout: () => void;
}

export function Cart({ onCheckout }: Props) {
  const lines = useCart((s) => s.lines);
  const addItem = useCart((s) => s.addItem);
  const decrementItem = useCart((s) => s.decrementItem);
  const removeItem = useCart((s) => s.removeItem);
  const clear = useCart((s) => s.clear);
  const totals = useCartTotals();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          <h2 className="font-semibold text-sm">Cart</h2>
          {totals.itemCount > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {totals.itemCount}
            </Badge>
          )}
        </div>
        {lines.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            className="h-7 text-xs text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-muted-foreground">
            <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No items yet</p>
            <p className="text-xs mt-1">Tap + on a menu item to start</p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="px-2 py-2 space-y-1">
            {lines.map(({ item, quantity }) => (
              <div
                key={item.id}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {item.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {item.name}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatEur(item.priceCents)} ·{" "}
                    {formatSats(item.priceSats * quantity)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => decrementItem(item.id)}
                    className="h-7 w-7 p-0"
                    aria-label={`Remove one ${item.name}`}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-medium w-6 text-center tabular-nums">
                    {quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addItem(item)}
                    className="h-7 w-7 p-0"
                    aria-label={`Add one ${item.name}`}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="border-t px-4 py-3 space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatEur(totals.totalCents)}</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>VAT ({VAT_RATE_PERCENT}%)</span>
          <span className="tabular-nums">{formatEur(totals.vatCents)}</span>
        </div>
        <Separator />
        <div className="flex justify-between items-baseline">
          <span className="font-semibold text-sm">Total</span>
          <div className="text-right">
            <div className="font-bold tabular-nums">
              {formatEur(totals.grossCents)}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {formatSats(totals.grossSats)}
            </div>
          </div>
        </div>
        <Button
          className="w-full"
          size="lg"
          disabled={lines.length === 0}
          onClick={onCheckout}
        >
          Pay with Numo
        </Button>
      </div>
    </div>
  );
}
