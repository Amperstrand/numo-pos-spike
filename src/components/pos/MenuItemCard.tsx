"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { MenuItemDTO } from "@/lib/types";
import { formatEur, formatSats } from "@/lib/types";
import { useCart } from "@/lib/cart-store";
import { cn } from "@/lib/utils";

interface Props {
  item: MenuItemDTO;
}

export function MenuItemCard({ item }: Props) {
  const addItem = useCart((s) => s.addItem);

  return (
    <Card
      className={cn(
        "group relative overflow-hidden p-4 transition-all hover:shadow-md",
        !item.available && "opacity-50"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="text-4xl leading-none" aria-hidden>
          {item.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold text-sm leading-tight truncate">
              {item.name}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1 min-h-[2rem]">
            {item.description}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="font-semibold text-sm">
                {formatEur(item.priceCents)}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {formatSats(item.priceSats)}
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => addItem(item)}
              disabled={!item.available}
              className="h-8 w-8 p-0"
              aria-label={`Add ${item.name} to cart`}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
