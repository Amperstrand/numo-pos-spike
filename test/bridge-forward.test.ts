import { describe, expect, it } from "bun:test";
import { mapSpikeLinesToBridgeItems } from "@/lib/bridge-forward";

const bridgeMenu = [
  { id: "sim-0001", name: "HAMBURGER" },
  { id: "sim-0002", name: "Cheeseburger" },
];

describe("mapSpikeLinesToBridgeItems", () => {
  it("maps spike lines to bridge skus by name", () => {
    const mapped = mapSpikeLinesToBridgeItems(
      [{ name: "HAMBURGER", quantity: 2 }],
      bridgeMenu,
    );
    expect(mapped).toEqual({ items: [{ sku: "sim-0001", quantity: 2 }] });
  });

  it("matches names case- and whitespace-insensitively", () => {
    const mapped = mapSpikeLinesToBridgeItems(
      [{ name: " cheeseburger ", quantity: 1 }],
      bridgeMenu,
    );
    expect(mapped).toEqual({ items: [{ sku: "sim-0002", quantity: 1 }] });
  });

  it("refuses to forward a basket with any unmapped item (no partial orders)", () => {
    const mapped = mapSpikeLinesToBridgeItems(
      [
        { name: "HAMBURGER", quantity: 1 },
        { name: "Truffle Fries", quantity: 1 },
      ],
      bridgeMenu,
    );
    expect("error" in mapped).toBe(true);
    expect((mapped as { error: string }).error).toContain("Truffle Fries");
  });

  it("rejects an empty basket", () => {
    const mapped = mapSpikeLinesToBridgeItems([], bridgeMenu);
    expect("error" in mapped).toBe(true);
  });
});
