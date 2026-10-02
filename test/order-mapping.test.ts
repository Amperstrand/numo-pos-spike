import { describe, expect, it } from "bun:test";
import { toKitchenItems } from "@/lib/order-mapping";
import { buildNumoPaymentReceivedWebhook } from "@/lib/numo-webhook";

const realShapedItem = {
  itemId: "71598f85-cfdb-4c92-9dd8-2bacbacd9706",
  uuid: "d0fc89a8-088a-4593-bead-7fb5b08a0ce7",
  sku: "4966545",
  name: "HAMBURGER",
  quantity: 2,
  priceType: "FIAT" as const,
  netPriceCents: 437,
  netTotalCents: 874,
  priceSats: 0,
  netTotalSats: 0,
  vatEnabled: true,
  vatRate: 19,
  grossTotalCents: 1040,
};

describe("toKitchenItems", () => {
  it("prefers the catalog sku over the per-item uuid", () => {
    const [row] = toKitchenItems([realShapedItem]);
    expect(row?.menuItemId).toBe("4966545");
  });

  it("falls back to itemId when sku is absent (web-POS simplified shape)", () => {
    const [row] = toKitchenItems([{ ...realShapedItem, sku: undefined }]);
    expect(row?.menuItemId).toBe(realShapedItem.itemId);
  });

  it("defaults optional integers to 0 (Prisma rejects undefined)", () => {
    const sparse = {
      itemId: "arancini",
      name: "Arancini (3 pc)",
      quantity: 1,
    } as never as Parameters<typeof toKitchenItems>[0][number];
    const [row] = toKitchenItems([sparse]);
    expect(row).toEqual({
      menuItemId: "arancini",
      name: "Arancini (3 pc)",
      quantity: 1,
      unitSats: 0,
      unitCents: 0,
      totalSats: 0,
      totalCents: 0,
    });
  });

  it("maps an empty basket to an empty create list", () => {
    expect(toKitchenItems([])).toEqual([]);
  });
});

describe("buildNumoPaymentReceivedWebhook", () => {
  it("wraps the simplified POS shape into the v2 contract", () => {
    const payload = buildNumoPaymentReceivedWebhook({
      paymentId: "q_123",
      amountSats: 1500,
      basketId: "pos_1",
      lineItems: [
        { itemId: "arancini", name: "Arancini (3 pc)", category: "Antipasti", quantity: 1, netPriceCents: 950, priceSats: 15833 },
      ],
    });
    expect(payload.event).toBe("payment.received");
    expect(payload.payloadVersion).toBe(2);
    expect(payload.payment?.paymentId).toBe("q_123");
    expect(payload.payment?.amountSats).toBe(1500);
    expect(payload.payment?.status).toBe("completed");
    expect(payload.checkout?.items?.[0]?.sku ?? payload.checkout?.items?.[0]?.itemId).toBe("arancini");
    expect(payload.eventId).toBeTruthy();
  });
});
