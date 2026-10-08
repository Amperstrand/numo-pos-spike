/**
 * Bridge-forwarding leg for the web POS: after a paid spike order, stage the
 * same basket as a provider order on the numo bridge so web orders also get a
 * venue-format order number (po-mu…-NNNN) in the bridge store.
 *
 * Demo-safe by construction: forwarding is skipped unless the bridge reports
 * mode "demo" (fixture orders only — a live bridge is never contacted with a
 * web basket). Every failure is returned, never thrown: the kitchen ticket
 * must not fail because the bridge leg hiccuped.
 */

export interface SpikeLine {
  name: string;
  quantity: number;
}

export interface BridgeMenuItem {
  id: string;
  name: string;
}

export interface BridgeForwardResult {
  ok: boolean;
  id?: string;
  orderNumber?: string;
  mode?: string;
  error?: string;
}

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:8787";
const SETTLE_POLL_INTERVAL_MS = 1_500;
const SETTLE_BUDGET_MS = 12_000;

// provider-protocol v1: npv1_ key from pairing (env until the spike has UI)
const BRIDGE_KEY = process.env.BRIDGE_KEY ?? "";

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
    ...(BRIDGE_KEY ? { Authorization: `Bearer ${BRIDGE_KEY}` } : {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

/**
 * Map spike cart lines to bridge {sku, quantity} items by menu-item name.
 * Returns an error string when any line is missing from the bridge menu —
 * a partial forward would misprice the basket, so we forward nothing.
 */
export function mapSpikeLinesToBridgeItems(
  lines: SpikeLine[],
  bridgeMenu: BridgeMenuItem[],
): { items: Array<{ sku: string; quantity: number }> } | { error: string } {
  const byName = new Map(
    bridgeMenu.map((i) => [i.name.trim().toUpperCase(), i.id] as const),
  );
  const items: Array<{ sku: string; quantity: number }> = [];
  for (const line of lines) {
    const sku = byName.get(line.name.trim().toUpperCase());
    if (!sku) {
      return { error: `not on bridge menu: ${JSON.stringify(line.name)}` };
    }
    items.push({ sku, quantity: line.quantity });
  }
  if (items.length === 0) return { error: "empty basket" };
  return { items };
}

export async function forwardPaidOrderToBridge(
  lines: SpikeLine[],
): Promise<BridgeForwardResult> {
  const base = process.env.BRIDGE_URL ?? DEFAULT_BRIDGE_URL;
  try {
    const mode = (await getJson(`${base}/mode`)) as { mode?: string };
    if (mode.mode !== "demo") {
      return {
        ok: false,
        error: `bridge mode is ${mode.mode ?? "?"} — web forwarding is demo-only`,
      };
    }

    const menu = (await getJson(`${base}/v1/provider/menu`)) as {
      items?: BridgeMenuItem[];
    };
    const mapped = mapSpikeLinesToBridgeItems(lines, menu.items ?? []);
    if ("error" in mapped) return { ok: false, error: mapped.error };

    // requestId: a network-retried forward dedupes to the original order
    const created = (await getJson(`${base}/v1/provider/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: mapped.items, requestId: crypto.randomUUID() }),
    })) as { id?: string; mode?: string };
    if (!created.id) return { ok: false, error: "bridge returned no order id" };

    // Demo invoices auto-settle at the testnut mint (~3 s); poll to paid.
    const deadline = Date.now() + SETTLE_BUDGET_MS;
    let status = "pending";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, SETTLE_POLL_INTERVAL_MS));
      const order = (await getJson(`${base}/v1/provider/orders/${created.id}`)) as {
        status?: string;
      };
      status = order.status ?? "pending";
      if (status === "paid" || status === "submitted") break;
    }
    if (status !== "paid" && status !== "submitted") {
      return {
        ok: false,
        id: created.id,
        mode: created.mode,
        error: `invoice still ${status} after ${SETTLE_BUDGET_MS / 1000}s`,
      };
    }

    const submitted = (await getJson(`${base}/v1/provider/orders/${created.id}/submit`, {
      method: "POST",
    })) as { status?: string; orderNumber?: string };
    if (!submitted.orderNumber) {
      return { ok: false, id: created.id, error: `submit returned ${submitted.status ?? "?"}` };
    }
    return { ok: true, id: created.id, orderNumber: submitted.orderNumber, mode: created.mode };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "bridge forward failed" };
  }
}
