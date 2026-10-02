"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShoppingCart, ChefHat, Activity } from "lucide-react";
import { PosPanel } from "@/components/pos/PosPanel";
import { KitchenDisplay } from "@/components/kitchen/KitchenDisplay";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [tab, setTab] = useState<"pos" | "kitchen" | "split">("split");

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ─── Top bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between border-b px-4 py-2 bg-background">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center h-7 w-7 rounded-md bg-foreground text-background font-bold text-xs">
            N
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">Numo POS · Spike</div>
            <div className="text-[10px] text-muted-foreground">
              Cashu-powered restaurant checkout demo
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="h-8">
            <TabsTrigger value="pos" className="text-xs">
              <ShoppingCart className="h-3 w-3 mr-1" />
              POS
            </TabsTrigger>
            <TabsTrigger value="kitchen" className="text-xs">
              <ChefHat className="h-3 w-3 mr-1" />
              Kitchen
            </TabsTrigger>
            <TabsTrigger value="split" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              Split view
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="hidden md:flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mr-1.5" />
            Cashu mint
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 mr-1.5" />
            Socket.io
          </Badge>
        </div>
      </header>

      {/* ─── Body: switches based on selected tab ───────────────────── */}
      <main className="flex-1 overflow-hidden">
        {tab === "pos" && (
          <div className="h-full">
            <PosPanel onPaid={() => setRefreshSignal((n) => n + 1)} />
          </div>
        )}

        {tab === "kitchen" && (
          <div className="h-full">
            <KitchenDisplay refreshSignal={refreshSignal} />
          </div>
        )}

        {tab === "split" && (
          <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0">
            <div className="h-full overflow-hidden border-r">
              <PosPanel onPaid={() => setRefreshSignal((n) => n + 1)} />
            </div>
            <div className="h-full overflow-hidden">
              <KitchenDisplay refreshSignal={refreshSignal} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
