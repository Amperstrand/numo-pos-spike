/**
 * Seed the spike from ANY jamezz venue table (jamezz KNOWN_TABLES ships 14
 * across DE/BE/NL/DK/SE; EUR venues are supported end-to-end today).
 *
 * Run: bun run scripts/seed-venue.ts --table <mid> [--vat N]
 *   --table  jamezz table QR id (default: Burgermeister Mehringdamm 8613S3X)
 *   --vat    eat-in VAT percent used for display (default 19; e.g. NL food 9)
 *
 * MenuItem.id = jamezz product id; priceCents is the GROSS venue price
 * (what the venue charges); foreign items from earlier seeds are parked
 * unavailable so only the seeded venue's menu shows.
 */
import { PrismaClient } from "@prisma/client";
import { burgermeisterTable, JamezzClient, tableMid } from "jamezz";

const BTC_PRICE_EUR = 76_000;
const eurCentsToSats = (cents: number) => Math.round(cents / ((BTC_PRICE_EUR * 100) / 100_000_000));

const args = process.argv.slice(2);
const tableIdx = args.indexOf("--table");
const vatIdx = args.indexOf("--vat");
const tableArg = tableIdx >= 0 ? args[tableIdx + 1] : "8613S3X";
const vatArg = vatIdx >= 0 ? Number(args[vatIdx + 1]) : 19;
if (!(vatArg > 0 && vatArg < 100)) throw new Error(`bad --vat: ${vatArg}`);

const db = new PrismaClient();

async function main() {
  const table = tableArg === "8613S3X" ? burgermeisterTable() : tableMid(tableArg);
  const client = new JamezzClient();
  const venue = await client.venue(table);
  if (!venue) throw new Error(`venue not found for table ${table}`);
  const menu = await client.menu(table);
  if (!menu) throw new Error("menu unavailable");
  if (menu.currency !== "EUR") {
    throw new Error(`${venue.name} prices in ${menu.currency} — EUR venues only for now`);
  }

  let seeded = 0;
  let skipped = 0;
  for (const category of menu.categories) {
    for (const item of category.items) {
      if (!item.available || !(item.price > 0)) {
        skipped++;
        continue;
      }
      const priceCents = Math.round(item.price * 100);
      const emoji = "🍽️";
      await db.menuItem.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          name: item.name,
          description: item.description ?? "",
          category: category.name,
          priceCents,
          priceSats: eurCentsToSats(priceCents),
          emoji,
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
      seeded++;
    }
  }

  const realIds = menu.categories.flatMap((c) => c.items.map((i) => i.id));
  const hidden = await db.menuItem.updateMany({
    where: { id: { notIn: realIds } },
    data: { available: false },
  });

  await db.venueMeta.upsert({
    where: { id: 1 },
    create: { id: 1, name: venue.name, tableQr: table, vatRate: vatArg, currency: menu.currency },
    update: { name: venue.name, tableQr: table, vatRate: vatArg, currency: menu.currency },
  });

  console.log(
    `${venue.name} (${table}): ${seeded} items seeded, ${skipped} skipped, ${hidden.count} foreign items hidden, VAT ${vatArg}%`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
