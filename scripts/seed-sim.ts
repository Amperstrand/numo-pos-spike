/**
 * Fully-offline SIM seed: writes the fixture venue "Burgermeister SIM"
 * (table SIMBURG1) and its items WITHOUT any jamezz network call —
 * practice runs never touch the real platform. Item ids match the
 * bridge's sim/sim-menu.json so webhook SKUs map 1:1.
 *
 * Run: DATABASE_URL="file:./db/sim.db" bun run scripts/seed-sim.ts
 */
import { PrismaClient } from "@prisma/client";

const BTC_PRICE_EUR = 76_000;
const eurCentsToSats = (cents: number) => Math.round(cents / ((BTC_PRICE_EUR * 100) / 100_000_000));

const VENUE = { name: "Burgermeister SIM", tableQr: "SIMBURG1", vatRate: 19 };

const ITEMS = [
  { id: "sim-1001", name: "SIM Hamburger", category: "Burger", priceCents: 520 },
  { id: "sim-1002", name: "SIM Cheeseburger", category: "Burger", priceCents: 640 },
  { id: "sim-1003", name: "SIM Meisterburger", category: "Burger", priceCents: 730 },
  { id: "sim-2001", name: "SIM Fries", category: "Fries", priceCents: 410 },
  { id: "sim-3001", name: "SIM Cola 0.33", category: "Drinks", priceCents: 340 },
  { id: "sim-3002", name: "SIM Fanta 0.33", category: "Drinks", priceCents: 340 },
];

const db = new PrismaClient();

async function main() {
  await db.menuItem.deleteMany({});
  for (const it of ITEMS) {
    await db.menuItem.create({
      data: {
        id: it.id,
        name: it.name,
        description: "Fixture item — SIM only, no real venue.",
        category: it.category,
        priceCents: it.priceCents,
        priceSats: eurCentsToSats(it.priceCents),
        emoji: "🍽️",
      },
    });
  }
  await db.venueMeta.upsert({
    where: { id: 1 },
    create: { id: 1, name: VENUE.name, tableQr: VENUE.tableQr, vatRate: VENUE.vatRate },
    update: { name: VENUE.name, tableQr: VENUE.tableQr, vatRate: VENUE.vatRate },
  });
  console.log(`SIM fixture seeded: ${VENUE.name} (${VENUE.tableQr}), ${ITEMS.length} items — zero jamezz calls`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
