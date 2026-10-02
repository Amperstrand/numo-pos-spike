// One-off cleanup: empty the orders table so the demo starts clean.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const r = await db.orderItem.deleteMany({});
  const o = await db.order.deleteMany({});
  console.log(`Deleted ${o.count} orders, ${r.count} items`);
}
main().finally(() => db.$disconnect());
