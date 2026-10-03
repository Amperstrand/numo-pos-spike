"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  CheckCircle2,
  ArrowRight,
  Copy,
  Check,
  Zap,
} from "lucide-react";
import { useCart, useCartTotals } from "@/lib/cart-store";
import { formatEur, formatSats } from "@/lib/types";
import { toast } from "sonner";

type Step =
  | "idle"
  | "creating-quote"
  | "awaiting-payment"
  | "customer-paying"
  | "verifying"
  | "emitting-webhook"
  | "done"
  | "error";

interface QuoteResponse {
  quote: string;
  request: string;
  amountSats: number;
  unit: string;
  state: string;
  expiry: number;
  mintUrl: string;
  mintMode?: "mock" | "testnut";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPaid: (orderId: string) => void;
}

export function PaymentModal({ open, onClose, onPaid }: Props) {
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const totals = useCartTotals();

  const [step, setStep] = useState<Step>("idle");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [proofs, setProofs] = useState<
    Array<{ amount: number; secret: string; C: string; id: string }>
  >([]);
  const [copied, setCopied] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Refs to latest cart state — read inside async effects without
  // retriggering the effect when the cart changes (which would cause
  // duplicate webhook emissions after `clear()` runs).
  const linesRef = useRef(lines);
  const totalsRef = useRef(totals);
  const clearRef = useRef(clear);
  const onPaidRef = useRef(onPaid);
  useEffect(() => {
    linesRef.current = lines;
    totalsRef.current = totals;
    clearRef.current = clear;
    onPaidRef.current = onPaid;
  });

  // Guard: each "transition" effect should fire at most once per step entry.
  const firedRef = useRef<Set<Step>>(new Set());
  const markFired = (s: Step) => {
    firedRef.current.add(s);
  };
  const resetFired = () => {
    firedRef.current = new Set();
  };

  // Reset state every time the modal opens.
  useEffect(() => {
    if (open) {
      setStep("creating-quote");
      setQuote(null);
      setProofs([]);
      setCopied(false);
      setOrderId(null);
      setErrorMsg(null);
      resetFired();
    } else {
      setStep("idle");
    }
  }, [open]);

  // ─── Step 1: create the NUT-04 mint quote ────────────────────────────
  useEffect(() => {
    if (!open || step !== "creating-quote" || firedRef.current.has("creating-quote")) return;
    markFired("creating-quote");
    (async () => {
      try {
        const res = await fetch("/api/mint/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountSats: totalsRef.current.totalSats }),
        });
        if (!res.ok) throw new Error(`quote failed: ${res.status}`);
        const data: QuoteResponse = await res.json();
        setQuote(data);
        setStep("awaiting-payment");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "unknown");
        setStep("error");
      }
    })();
  }, [open, step]);

  // ─── Step 2: simulate the customer paying the Lightning invoice ──────
  const simulateCustomerPay = useCallback(async () => {
    if (!quote) return;
    setStep("customer-paying");
    try {
      const res = await fetch("/api/mint/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote: quote.quote }),
      });
      if (!res.ok) throw new Error(`pay failed: ${res.status}`);
      const data = await res.json();
      setProofs(data.proofs);
      setStep("verifying");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "unknown");
      setStep("error");
    }
  }, [quote]);

  // ─── Step 3: verify proofs at the mint ────────────────────────────────
  useEffect(() => {
    if (step !== "verifying" || proofs.length === 0 || firedRef.current.has("verifying")) return;
    markFired("verifying");
    (async () => {
      try {
        const res = await fetch("/api/mint/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proofs }),
        });
        if (!res.ok) throw new Error(`verify failed: ${res.status}`);
        const data = await res.json();
        if (!data.ok) throw new Error("proofs rejected");
        setStep("emitting-webhook");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "unknown");
        setStep("error");
      }
    })();
  }, [step, proofs]);

  // ─── Step 4: emit Numo webhook v2 → which creates the kitchen order ──
  // Reads cart state from refs so it doesn't depend on `lines` / `clear`
  // (which change after `clear()` runs — that would retrigger this effect
  // and emit the webhook twice).
  useEffect(() => {
    if (step !== "emitting-webhook" || !quote || firedRef.current.has("emitting-webhook")) return;
    markFired("emitting-webhook");
    (async () => {
      try {
        const currentLines = linesRef.current;
        const currentTotals = totalsRef.current;
        const webhookPayload = {
          event: "payment.received",
          payloadVersion: 2,
          paymentId: quote.quote, // pretend the quote id IS the payment id
          amountSats: currentTotals.totalSats,
          basketId: `pos_${Date.now()}`,
          lineItems: currentLines.map(({ item, quantity }) => ({
            itemId: item.id,
            name: item.name,
            category: item.category,
            quantity,
            netPriceCents: item.priceCents,
            priceSats: item.priceSats,
          })),
        };

        const res = await fetch("/api/webhooks/numo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `webhook failed: ${res.status}`);
        }
        const data = await res.json();
        setOrderId(data.orderId);
        setStep("done");
        clearRef.current();
        toast.success("Payment received — order sent to kitchen!");
        if (data.orderId) onPaidRef.current(data.orderId);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "unknown");
        setStep("error");
      }
    })();
  }, [step, quote]);

  const stepOrder: Step[] = [
    "creating-quote",
    "awaiting-payment",
    "customer-paying",
    "verifying",
    "emitting-webhook",
    "done",
  ];
  const progressPct = Math.max(
    0,
    Math.min(
      100,
      (stepOrder.indexOf(step) + (step === "done" ? 1 : 0)) *
        (100 / stepOrder.length)
    )
  );

  const copyToken = () => {
    if (!quote) return;
    navigator.clipboard.writeText(quote.request);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 fill-yellow-400 text-yellow-500" />
            Numo Payment
          </DialogTitle>
          <DialogDescription>
            Pay with Cashu ecash via Numo terminal
          </DialogDescription>
        </DialogHeader>

        {/* Amount due */}
        <div className="rounded-lg border bg-muted/40 p-4 text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
            Amount due
          </div>
          <div className="text-3xl font-bold tabular-nums">
            {formatEur(totals.grossCents)}
          </div>
          <div className="text-sm text-muted-foreground tabular-nums">
            {formatSats(totals.totalSats)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Quote</span>
            <span>Pay</span>
            <span>Verify</span>
            <span>Webhook</span>
            <span>Done</span>
          </div>
        </div>

        {/* Step-specific content */}
        {step === "creating-quote" && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Creating NUT-04 mint quote…
          </div>
        )}

        {step === "awaiting-payment" && quote && (
          <div className="space-y-3">
            <div className="flex justify-center">
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG
                  value={quote.request}
                  size={180}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">
                BOLT11 invoice (scan with Lightning wallet)
              </div>
              <button
                onClick={copyToken}
                className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground break-all max-w-full"
              >
                {quote.request.slice(0, 48)}…
                {copied ? (
                  <Check className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <Copy className="h-3 w-3 flex-shrink-0" />
                )}
              </button>
            </div>
            <div className="text-[10px] text-center text-muted-foreground">
              Mint: <code className="font-mono">{quote.mintUrl}</code>
            </div>

            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs">
              <div className="font-medium text-blue-900 mb-1">
                Hackathon simulation
              </div>
              <p className="text-blue-800 leading-relaxed">
                In production the customer pays this BOLT11 with their own
                Lightning wallet and the mint issues ecash proofs. For this
                spike we simulate the wallet with one click.
              </p>
            </div>

            <Button
              onClick={simulateCustomerPay}
              className="w-full"
              size="lg"
              type="button"
            >
              <Zap className="h-4 w-4 mr-1.5 fill-yellow-400 text-yellow-500" />
              {quote?.mintMode === "testnut"
                ? "Settle at testnut mint (auto-paid)"
                : "Simulate customer payment"}
            </Button>
          </div>
        )}

        {step === "customer-paying" && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Minting Cashu proofs…
          </div>
        )}

        {step === "verifying" && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Verifying proofs at the mint…
          </div>
        )}

        {step === "emitting-webhook" && (
          <div className="space-y-2 py-2">
            <div className="flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Emitting <code className="font-mono mx-1">payment.received</code> webhook…
            </div>
            <div className="text-[10px] text-center text-muted-foreground">
              This is the exact contract Numo uses to notify your backend.
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3 py-2">
            <div className="flex flex-col items-center text-center gap-2">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="font-semibold">Payment received</div>
              <div className="text-xs text-muted-foreground">
                Order sent to kitchen endpoint
              </div>
              {orderId && (
                <Badge variant="secondary" className="font-mono text-xs">
                  Order #{orderId.slice(-6).toUpperCase()}
                </Badge>
              )}
            </div>
            <Button onClick={onClose} className="w-full" size="lg" type="button">
              Close
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-3 py-2">
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm">
              <div className="font-medium text-destructive mb-1">
                Payment failed
              </div>
              <div className="text-xs text-destructive/80 break-all">
                {errorMsg}
              </div>
            </div>
            <Button onClick={onClose} variant="outline" className="w-full" type="button">
              Close
            </Button>
          </div>
        )}

        {/* Footer: step indicator */}
        <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground pt-1 border-t">
          <span>
            Step {Math.min(stepOrder.indexOf(step) + 1, stepOrder.length)} /{" "}
            {stepOrder.length}
          </span>
          {quote && (
            <>
              <ArrowRight className="h-3 w-3 mx-1" />
              <span className="font-mono">quote: {quote.quote.slice(0, 12)}…</span>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
