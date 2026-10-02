/**
 * Seed script: the REAL Burgermeister Mehringdamm menu, pulled live from the
 * venue's table-ordering platform (jamezz, table QR 8613S3X).
 *
 * MenuItem.id is the jamezz product id — the same id Numo's catalog CSV
 * carries in its SKU column, so webhook line items (sku) match kitchen
 * tickets 1:1. Prices are GROSS EUR cents (as shown on the venue menu);
 * sats equivalents use a fixed BTC price like the original seed.
 *
 * Run: `bun run db:seed-burgermeister`
 */
import { PrismaClient } from "@prisma/client";
import { burgermeisterTable, JamezzClient } from "jamezz";

const BTC_PRICE_EUR = 76_000;
const SATS_PER_BTC = 100_000_000;
const EUR_CENTS_PER_SAT = (BTC_PRICE_EUR * 100) / SATS_PER_BTC;
const eurCentsToSats = (cents: number) => Math.round(cents / EUR_CENTS_PER_SAT);

const EMOJI_BY_CATEGORY: Record<string, string> = {
  Burger: "🍔",
  Fries: "🍟",
  Shakes: "🥤",
  Drinks: "🥤",
  Merchandise: "🧢",
};

const db = new PrismaClient();

async function main() {
  const client = new JamezzClient();
  const table = burgermeisterTable();
  console.log(`fetching live menu for ${table} ...`);
  const menu = await client.menu(table);
  if (!menu) throw new Error("menu unavailable from the platform");

  let created = 0;
  let skipped = 0;
  for (const category of menu.categories) {
    for (const item of category.items) {
      if (!item.available || !(item.price > 0)) {
        skipped++;
        continue;
      }
      const priceCents = Math.round(item.price * 100);
      await db.menuItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          name: item.name,
          description: item.description ?? "",
          category: category.name,
          priceCents,
          priceSats: eurCentsToSats(priceCents),
          emoji: EMOJI_BY_CATEGORY[category.name] ?? "🍽️",
        },
        update: {
          name: item.name,
          description: item.description ?? "",
          category: category.name,
          priceCents,
          priceSats: eurCentsToSats(priceCents),
          available: true,
        },
      });
      created++;
    }
  }

  // Park the fictional trattoria items so only the real menu shows.
  const realIds = menu.categories.flatMap((c) => c.items.map((i) => i.id));
  const hidden = await db.menuItem.updateMany({
    where: { id: { notIn: realIds } },
    data: { available: false },
  });

  console.log(
    `${menu.venueName}: ${created} items seeded (${menu.categories.length} categories), ${skipped} skipped (unavailable/size-parent), ${hidden.count} foreign items hidden`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
