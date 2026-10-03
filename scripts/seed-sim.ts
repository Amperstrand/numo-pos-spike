/**
 * Fully-offline SIM seed: reads the bridge's sim/sim-menu.json (generated
 * from a live read by gen-sim-menu.mjs — real names, real EUR prices,
 * synthetic skus). Zero jamezz calls at runtime.
 *
 * Run: DATABASE_URL="file:./db/sim.db" bun run scripts/seed-sim.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const BTC_PRICE_EUR = 76_000;
const eurCentsToSats = (cents: number) => Math.round(cents / ((BTC_PRICE_EUR * 100) / 100_000_000));

const FIXTURE_PATH = "../bridge/sim/sim-menu.json";
const fixture = JSON.parse(readFileSync(new URL(FIXTURE_PATH, import.meta.url), "utf8")) as {
  venueName: string; venueId: string; currency: string;
  categories: Array<{ name: string; items: Array<{ id: string; name: string; description: string | null; price: number; category: string }> }>;
};

const db = new PrismaClient();

async function main() {
  await db.menuItem.deleteMany({});
  for (const cat of fixture.categories) {
    for (const item of cat.items) {
      const priceCents = Math.round(item.price * 100);
      await db.menuItem.create({
        data: {
          id: item.id,
          name: item.name,
          description: item.description ?? "Fixture item — SIM only.",
          category: cat.name,
          priceCents,
          priceSats: eurCentsToSats(priceCents),
          emoji: "\uD83C\uDF5D",
        },
      });
    }
  }
  await db.venueMeta.upsert({
    where: { id: 1 },
    create: { id: 1, name: fixture.venueName, tableQr: fixture.venueId, vatRate: 19 },
    update: { name: fixture.venueName, tableQr: fixture.venueId, vatRate: 19 },
  });
  const count = fixture.categories.reduce((n, c) => n + c.items.length, 0);
  console.log(`SIM fixture seeded: ${fixture.venueName} (${fixture.venueId}), ${count} items — zero jamezz calls`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
