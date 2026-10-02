/**
 * Numo webhook payload schema (payment.received, payloadVersion = 2).
 *
 * Verbatim copy of the contract documented at
 * cashubtc/numo/docs/webhook-payload-v2.ts — kept here so the spike
 * honours the *exact* shape Numo will send in production.
 *
 * Critical implementation notes (from the Numo source):
 *  - `token` is NEVER included — only metadata.
 *  - Endpoint auth is configured per-endpoint inside Numo (Settings → Webhooks).
 *    When set, Numo sends `Authorization: <configured-auth-key>` (no "Bearer "
 *    prefix in production — but the dispatcher is permissive about that).
 *  - Nullable Android fields are often omitted from JSON; treat them as optional.
 *  - `checkout` is present only for checkout-originated payments.
 *  - `transaction` is included for normal app flows; treat as optional for
 *    forward/backward compatibility.
 */

export type NumoWebhookEventName = "payment.received";

export interface NumoTerminalMeta {
  platform: "android";
  appPackage: string;
  appVersionName: string;
  appVersionCode: number;
}

export interface NumoPaymentSummary {
  paymentId: string;
  amountSats: number;
  paymentType: "cashu" | "lightning" | string;
  status: "pending" | "completed" | "cancelled" | string;
  mintUrl?: string;
  tipAmountSats: number;
  tipPercentage: number;
  basketId?: string;
  lightningInvoice?: string;
  lightningQuoteId?: string;
  lightningMintUrl?: string;
}

export interface NumoSwapToLightningMintMetadata {
  unknownMintUrl: string;
  meltQuoteId: string;
  lightningMintUrl: string;
  lightningQuoteId: string;
}

export interface NumoTransactionMetadata {
  paymentId: string;
  status: "pending" | "completed" | "cancelled" | string;
  paymentType: "cashu" | "lightning" | string;
  amountSats: number;
  baseAmountSats: number;
  tipAmountSats: number;
  tipPercentage: number;
  unit: string;
  entryUnit: string;
  enteredAmount: number;
  formattedAmount?: string;
  bitcoinPrice?: number;
  mintUrl?: string;
  lightningInvoice?: string;
  lightningQuoteId?: string;
  lightningMintUrl?: string;
  paymentRequest?: string;
  basketId?: string;
  dateMs: number;
  swapToLightningMint?: NumoSwapToLightningMintMetadata;
}

export interface NumoCheckoutLineItem {
  itemId: string;
  uuid: string;
  name: string;
  variationName?: string;
  sku?: string;
  category?: string;
  quantity: number;
  priceType: "FIAT" | "SATS" | string;
  netPriceCents: number;
  priceSats: number;
  priceCurrency: string;
  vatEnabled: boolean;
  vatRate: number;
  displayName: string;
  netTotalCents: number;
  netTotalSats: number;
  vatPerUnitCents: number;
  totalVatCents: number;
  grossPricePerUnitCents: number;
  grossTotalCents: number;
}

export interface NumoCheckoutMetadata {
  checkoutBasketId: string;
  savedBasketId?: string;
  checkoutTimestamp: number;
  currency: string;
  bitcoinPrice?: number;
  totalSatoshis: number;
  itemCount: number;
  hasVat: boolean;
  hasMixedPriceTypes: boolean;
  fiatNetTotalCents: number;
  fiatVatTotalCents: number;
  fiatGrossTotalCents: number;
  satsDirectTotal: number;
  /** VAT percentage -> total VAT amount in cents. JSON keys are strings. */
  vatBreakdown: Record<string, number>;
  items: NumoCheckoutLineItem[];
}

export interface NumoPaymentReceivedWebhookV2 {
  event: NumoWebhookEventName;
  payloadVersion: 2;
  eventId: string;
  timestampMs: number;
  timestampIso: string;
  payment: NumoPaymentSummary;
  transaction?: NumoTransactionMetadata;
  checkout?: NumoCheckoutMetadata;
  terminal: NumoTerminalMeta;
}

/** Terminal identity used in every webhook we emit. */
export const NUMO_TERMINAL: NumoTerminalMeta = {
  platform: "android",
  appPackage: "com.electricdreams.numo",
  appVersionName: "1.0.0-spike",
  appVersionCode: 1,
};

/** Mint URL the spike simulates. */
export const SPIKE_MINT_URL = "https://mint.numo-spike.local/cashu-bitcoin";

/** VAT rate applied to the demo restaurant (Norwegian-standard 25 %). */
export const SPIKE_VAT_RATE = 25;

/**
 * Build a Numo-shaped `payment.received` v2 webhook payload from a successful
 * mock-Cashu payment. The shape mirrors what the real Numo Android app would
 * POST to a configured webhook endpoint.
 */
export function buildNumoPaymentReceivedWebhook(args: {
  paymentId: string;
  amountSats: number;
  basketId: string;
  lineItems: Array<{
    itemId: string;
    name: string;
    category: string;
    quantity: number;
    netPriceCents: number;
    priceSats: number;
  }>;
  currency?: string;
  bitcoinPrice?: number;
}): NumoPaymentReceivedWebhookV2 {
  const now = Date.now();
  const currency = args.currency ?? "EUR";
  const vatRate = SPIKE_VAT_RATE;

  // Build checkout line items with VAT math (gross-up to match Numo's shape).
  const checkoutItems: NumoCheckoutLineItem[] = args.lineItems.map((it, idx) => {
    const netTotalCents = it.netPriceCents * it.quantity;
    const netTotalSats = it.priceSats * it.quantity;
    const vatPerUnitCents = Math.round(it.netPriceCents * (vatRate / 100));
    const grossPricePerUnitCents = it.netPriceCents + vatPerUnitCents;
    const grossTotalCents = grossPricePerUnitCents * it.quantity;
    const totalVatCents = vatPerUnitCents * it.quantity;
    return {
      itemId: it.itemId,
      uuid: `${it.itemId}-${idx}-${now}`,
      name: it.name,
      category: it.category,
      quantity: it.quantity,
      priceType: "FIAT",
      netPriceCents: it.netPriceCents,
      priceSats: it.priceSats,
      priceCurrency: currency,
      vatEnabled: true,
      vatRate,
      displayName: it.name,
      netTotalCents,
      netTotalSats,
      vatPerUnitCents,
      totalVatCents,
      grossPricePerUnitCents,
      grossTotalCents,
    };
  });

  const fiatNetTotalCents = checkoutItems.reduce(
    (s, i) => s + i.netTotalCents,
    0
  );
  const fiatVatTotalCents = checkoutItems.reduce(
    (s, i) => s + i.totalVatCents,
    0
  );
  const fiatGrossTotalCents = fiatNetTotalCents + fiatVatTotalCents;
  const satsDirectTotal = checkoutItems.reduce(
    (s, i) => s + i.netTotalSats,
    0
  );
  const itemCount = checkoutItems.reduce((s, i) => s + i.quantity, 0);

  const payment: NumoPaymentSummary = {
    paymentId: args.paymentId,
    amountSats: args.amountSats,
    paymentType: "cashu",
    status: "completed",
    mintUrl: SPIKE_MINT_URL,
    tipAmountSats: 0,
    tipPercentage: 0,
    basketId: args.basketId,
  };

  const transaction: NumoTransactionMetadata = {
    paymentId: args.paymentId,
    status: "completed",
    paymentType: "cashu",
    amountSats: args.amountSats,
    baseAmountSats: args.amountSats,
    tipAmountSats: 0,
    tipPercentage: 0,
    unit: "sat",
    entryUnit: "EUR",
    enteredAmount: fiatGrossTotalCents / 100,
    formattedAmount: `€${(fiatGrossTotalCents / 100).toFixed(2)}`,
    bitcoinPrice: args.bitcoinPrice ?? 60000,
    mintUrl: SPIKE_MINT_URL,
    basketId: args.basketId,
    dateMs: now,
  };

  const checkout: NumoCheckoutMetadata = {
    checkoutBasketId: args.basketId,
    checkoutTimestamp: now,
    currency,
    bitcoinPrice: args.bitcoinPrice ?? 60000,
    totalSatoshis: args.amountSats,
    itemCount,
    hasVat: true,
    hasMixedPriceTypes: false,
    fiatNetTotalCents,
    fiatVatTotalCents,
    fiatGrossTotalCents,
    satsDirectTotal,
    vatBreakdown: { [String(vatRate)]: fiatVatTotalCents },
    items: checkoutItems,
  };

  return {
    event: "payment.received",
    payloadVersion: 2,
    eventId: `evt_${args.paymentId}_${now}`,
    timestampMs: now,
    timestampIso: new Date(now).toISOString(),
    payment,
    transaction,
    checkout,
    terminal: NUMO_TERMINAL,
  };
}
