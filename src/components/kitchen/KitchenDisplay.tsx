"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ChefHat,
  Flame,
  CheckCheck,
  Bell,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { KitchenOrder } from "@/lib/types";
import { formatSats, formatEur } from "@/lib/types";
import { toast } from "sonner";

const STATUS_META: Record<
  KitchenOrder["status"],
  {
    label: string;
    color: string;
    nextLabel: string;
    nextValue: KitchenOrder["status"];
    icon: typeof Flame;
  }
> = {
  NEW: {
    label: "New",
    color: "bg-blue-500",
    nextLabel: "Start cooking",
    nextValue: "PREPARING",
    icon: Bell,
  },
  PREPARING: {
    label: "Preparing",
    color: "bg-orange-500",
    nextLabel: "Mark ready",
    nextValue: "READY",
    icon: Flame,
  },
  READY: {
    label: "Ready",
    color: "bg-green-500",
    nextLabel: "Pick up",
    nextValue: "PICKED_UP",
    icon: CheckCheck,
  },
  PICKED_UP: {
    label: "Picked up",
    color: "bg-muted",
    nextLabel: "",
    nextValue: "PICKED_UP",
    icon: CheckCheck,
  },
};

interface Props {
  /** Optional ref to the parent so it can ask for a refresh after pay. */
  refreshSignal?: number;
}

export function KitchenDisplay({ refreshSignal }: Props) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // ─── Initial load ─────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/orders");
      if (!res.ok) return;
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch (e) {
      console.warn("[kitchen] load failed", e);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders, refreshSignal]);

  // ─── Real-time via Socket.io mini-service on port 3003 ───────────────
  useEffect(() => {
    // Per Caddy gateway contract: connect to "/" with XTransformPort query.
    // Socket.io path stays default ("/socket.io/") so it doesn't conflict
    // with the kitchen-service's own HTTP routes.
    const sock = io("/", {
      path: "/socket.io/",
      query: { XTransformPort: "3003" },
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socketRef.current = sock;

    sock.on("connect", () => setConnected(true));
    sock.on("disconnect", () => setConnected(false));
    sock.on("kitchen:connected", () => setConnected(true));

    sock.on("kitchen:order:new", (order: KitchenOrder) => {
      setOrders((prev) => {
        // Replace if exists (defensive — webhook is the only producer)
        const filtered = prev.filter((o) => o.id !== order.id);
        return [order, ...filtered].slice(0, 50);
      });
      toast.info(`New order arrived`, {
        description: `Table ${order.id.slice(-4).toUpperCase()} · ${formatSats(order.totalSats)}`,
      });
    });

    sock.on("kitchen:order:update", (patch: { id: string; status: KitchenOrder["status"]; updatedAt: string }) => {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === patch.id ? { ...o, status: patch.status, updatedAt: patch.updatedAt } : o
        )
      );
    });

    return () => {
      sock.disconnect();
    };
  }, []);

  const advanceOrder = async (id: string, next: KitchenOrder["status"]) => {
    if (next === "PICKED_UP") {
      // Optimistically remove after a brief delay (lets the success badge show).
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: "PICKED_UP" } : o))
      );
      setTimeout(() => {
        setOrders((prev) => prev.filter((o) => o.id !== id));
      }, 1200);
    } else {
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, status: next } : o))
      );
    }

    try {
      await fetch(`/api/kitchen/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
    } catch (e) {
      console.warn("[kitchen] status update failed", e);
      // Roll back by reloading from server.
      loadOrders();
    }
  };

  const activeOrders = orders.filter((o) => o.status !== "PICKED_UP");

  return (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="flex items-center gap-2">
          <ChefHat className="h-4 w-4" />
          <h2 className="font-semibold text-sm">Kitchen Display</h2>
          {activeOrders.length > 0 && (
            <Badge variant="secondary" className="tabular-nums">
              {activeOrders.length} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Badge variant="outline" className="text-green-600 border-green-300">
              <Wifi className="h-3 w-3 mr-1" />
              Live
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <WifiOff className="h-3 w-3 mr-1" />
              Offline
            </Badge>
          )}
        </div>
      </div>

      {activeOrders.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-muted-foreground">
            <ChefHat className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium">No active orders</p>
            <p className="text-xs mt-1">
              New orders from the POS will appear here in real-time
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-3 grid gap-2 grid-cols-1">
            {activeOrders.map((order) => {
              const meta = STATUS_META[order.status];
              const Icon = meta.icon;
              const minutesAgo = Math.max(
                0,
                Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000)
              );
              return (
                <Card key={order.id} className="p-3 relative overflow-hidden">
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 ${meta.color}`}
                  />
                  <div className="pl-2">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            #{order.id.slice(-6).toUpperCase()}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`${meta.color} text-white text-[10px]`}
                          >
                            <Icon className="h-3 w-3 mr-1" />
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {minutesAgo} min ago
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-sm tabular-nums">
                          {formatEur(order.totalCents)}
                        </div>
                        <div className="text-[10px] text-muted-foreground tabular-nums">
                          {formatSats(order.totalSats)}
                        </div>
                      </div>
                    </div>

                    <Separator className="my-2" />

                    <ul className="space-y-1">
                      {order.items.map((it, idx) => (
                        <li key={`${it.menuItemId}-${idx}`} className="text-xs flex items-start gap-2">
                          <span className="font-semibold text-foreground tabular-nums">
                            {it.quantity}×
                          </span>
                          <span className="flex-1">{it.name}</span>
                        </li>
                      ))}
                    </ul>

                    {meta.nextValue !== order.status && (
                      <Button
                        size="sm"
                        className="w-full mt-3 h-8"
                        onClick={() => advanceOrder(order.id, meta.nextValue)}
                      >
                        {meta.nextLabel}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
