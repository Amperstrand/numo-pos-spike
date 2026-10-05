import { describe, expect, it } from "bun:test";
import { buildNumoPaymentReceivedWebhook } from "@/lib/numo-webhook";

const hamburger = {
  itemId: "4966545",
  name: "HAMBURGER",
  category: "Burger",
  quantity: 2,
  netPriceCents: 437,
  priceSats: 6842,
};

describe("buildNumoPaymentReceivedWebhook VAT math", () => {
  it("grosses up net cents at the venue rate (19% Burgermeister)", () => {
    const payload = buildNumoPaymentReceivedWebhook({
      paymentId: "q1",
      amountSats: 13684,
      basketId: "b1",
      lineItems: [hamburger],
      vatRate: 19,
    });
    const c = payload.checkout!;
    expect(c.fiatNetTotalCents).toBe(874);
    expect(c.fiatVatTotalCents).toBe(166);
    // Kitchen total must equal what the POS charged: 2 × €5.20 gross.
    expect(c.fiatGrossTotalCents).toBe(1040);
    expect(c.vatBreakdown["19"]).toBe(166);
    expect(c.items[0]?.grossPricePerUnitCents).toBe(520);
  });

  it("keeps the legacy 25% default when no vatRate is passed", () => {
    const payload = buildNumoPaymentReceivedWebhook({
      paymentId: "q1",
      amountSats: 13684,
      basketId: "b1",
      lineItems: [hamburger],
    });
    expect(payload.checkout!.items[0]?.vatRate).toBe(25);
    expect(payload.checkout!.vatBreakdown["25"]).toBe(
      payload.checkout!.fiatVatTotalCents,
    );
  });
});
