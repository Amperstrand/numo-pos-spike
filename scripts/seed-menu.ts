/**
 * Seed script: populates the legacy restaurant menu.
 *
 * Models a small Italian restaurant ("Trattoria Numo") — the kind of place
 * that might already have a back-office POS exporting a CSV / REST menu.
 *
 * Run: `bun run db:seed`
 *
 * Prices are EUR-cents; sats equivalents are pre-computed at a fixed
 * BTC price of €60 000 (1 BTC = 6 000 000 000 sats). In a real integration
 * Numo pulls the live price from its configured mints.
 */
import { PrismaClient } from "@prisma/client";

const BTC_PRICE_EUR = 60_000;
const SATS_PER_BTC = 100_000_000;
const EUR_CENTS_PER_SAT = (BTC_PRICE_EUR * 100) / SATS_PER_BTC;

const eurCentsToSats = (cents: number) =>
  Math.round(cents / EUR_CENTS_PER_SAT);

const db = new PrismaClient();

type Seed = {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  emoji: string;
};

const MENU: Seed[] = [
  // ── Antipasti ──────────────────────────────────────────────────────────
  {
    id: "bruschetta",
    name: "Bruschetta al Pomodoro",
    description:
      "Toasted sourdough topped with San Marzano tomatoes, garlic, basil and a drizzle of extra-virgin olive oil.",
    category: "Antipasti",
    priceCents: 750,
    emoji: "🍅",
  },
  {
    id: "burrata",
    name: "Burrata di Andria",
    description:
      "Creamy Puglian burrata, charred peach, prosciutto di Parma and aged balsamic.",
    category: "Antipasti",
    priceCents: 1350,
    emoji: "🧀",
  },
  {
    id: "arancini",
    name: "Arancini (3 pc)",
    description:
      "Crisp saffron-rice spheres filled with ragù and mozzarella, served with arrabbiata mayo.",
    category: "Antipasti",
    priceCents: 950,
    emoji: "🍙",
  },
  // ── Pizza ──────────────────────────────────────────────────────────────
  {
    id: "pizza-margherita",
    name: "Pizza Margherita",
    description:
      "San Marzano tomato, fior di latte mozzarella, fresh basil, extra-virgin olive oil. 72-hour ferment.",
    category: "Pizza",
    priceCents: 1250,
    emoji: "🍕",
  },
  {
    id: "pizza-diavola",
    name: "Pizza Diavola",
    description:
      "Spicy Calabrian salami, mozzarella, tomato, chilli oil. For those who like it hot.",
    category: "Pizza",
    priceCents: 1450,
    emoji: "🌶️",
  },
  {
    id: "pizza-quattro-formaggi",
    name: "Quattro Formaggi",
    description:
      "Mozzarella, gorgonzola, fontina, parmigiano. A cheese-lover's classic.",
    category: "Pizza",
    priceCents: 1550,
    emoji: "🧀",
  },
  // ── Pasta ──────────────────────────────────────────────────────────────
  {
    id: "carbonara",
    name: "Spaghetti alla Carbonara",
    description:
      "Guanciale, Pecorino Romano, egg yolk, cracked black pepper. Strictly no cream.",
    category: "Pasta",
    priceCents: 1450,
    emoji: "🍝",
  },
  {
    id: "tagliatelle-ragu",
    name: "Tagliatelle al Ragù",
    description:
      "Hand-cut tagliatelle, slow-braised beef ragù Bolognese, Parmigiano-Reggiano.",
    category: "Pasta",
    priceCents: 1550,
    emoji: "🍝",
  },
  {
    id: "cacio-e-pepe",
    name: "Cacio e Pepe",
    description:
      "Tonnarelli, Pecorino Romano, freshly cracked black pepper. Three ingredients, infinite technique.",
    category: "Pasta",
    priceCents: 1350,
    emoji: "🧀",
  },
  // ── Secondi ────────────────────────────────────────────────────────────
  {
    id: "saltimbocca",
    name: "Saltimbocca alla Romana",
    description:
      "Veal escalope, prosciutto, sage, white wine butter sauce. Served with roast potatoes.",
    category: "Secondi",
    priceCents: 1950,
    emoji: "🥩",
  },
  {
    id: "branzino",
    name: "Branzino al Forno",
    description:
      "Whole sea bass baked in salt crust, lemon, capers, roasted cherry tomatoes.",
    category: "Secondi",
    priceCents: 2250,
    emoji: "🐟",
  },
  // ── Dolci ──────────────────────────────────────────────────────────────
  {
    id: "tiramisu",
    name: "Tiramisù",
    description:
      "Mascarpone, espresso-soaked savoiardi, cocoa. Nonna-approved recipe.",
    category: "Dolci",
    priceCents: 750,
    emoji: "☕",
  },
  {
    id: "panna-cotta",
    name: "Panna Cotta",
    description:
      "Vanilla bean cream, macerated berries, balsamic reduction.",
    category: "Dolci",
    priceCents: 700,
    emoji: "🍓",
  },
  // ── Bevande ────────────────────────────────────────────────────────────
  {
    id: "espresso",
    name: "Espresso",
    description: "Single origin Italian roast, double shot.",
    category: "Bevande",
    priceCents: 250,
    emoji: "☕",
  },
  {
    id: "aperol-spritz",
    name: "Aperol Spritz",
    description: "Aperol, Prosecco DOCG, soda, orange slice.",
    category: "Bevande",
    priceCents: 850,
    emoji: "🍹",
  },
  {
    id: "negroni",
    name: "Negroni",
    description:
      "Equal parts gin, Campari, sweet vermouth. Stirred, orange peel.",
    category: "Bevande",
    priceCents: 1100,
    emoji: "🍸",
  },
  {
    id: "acqua",
    name: "Acqua Frizzante 0.5 L",
    description: "Italian sparkling mineral water.",
    category: "Bevande",
    priceCents: 300,
    emoji: "💧",
  },
];

async function main() {
  console.log(`Seeding ${MENU.length} menu items…`);

  for (const item of MENU) {
    await db.menuItem.upsert({
      where: { id: item.id },
      update: {
        name: item.name,
        description: item.description,
        category: item.category,
        priceCents: item.priceCents,
        priceSats: eurCentsToSats(item.priceCents),
        emoji: item.emoji,
        available: true,
      },
      create: {
        ...item,
        priceSats: eurCentsToSats(item.priceCents),
        available: true,
      },
    });
  }

  console.log("Done. Sample rows:");
  const sample = await db.menuItem.findMany({ take: 3 });
  console.dir(sample, { depth: null });
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
