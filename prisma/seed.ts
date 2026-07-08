import { PrismaClient } from "@prisma/client";

import { PROPERTIES } from "../lib/constants";

const prisma = new PrismaClient();

/**
 * Seed foundational reference data: the three Blue Karma properties and their
 * restaurant + spa outlets. Idempotent — safe to run repeatedly (upserts on the
 * unique `code` / `[propertyId, kind]` keys).
 */
async function main() {
  for (const property of PROPERTIES) {
    const record = await prisma.property.upsert({
      where: { code: property.code },
      update: { name: property.name, location: property.location },
      create: {
        code: property.code,
        name: property.name,
        location: property.location,
      },
    });

    const outlets = [
      { kind: "restaurant", name: property.restaurant },
      { kind: "spa", name: property.spa },
    ];

    for (const outlet of outlets) {
      await prisma.outlet.upsert({
        where: {
          propertyId_kind: { propertyId: record.id, kind: outlet.kind },
        },
        update: { name: outlet.name },
        create: {
          propertyId: record.id,
          kind: outlet.kind,
          name: outlet.name,
        },
      });
    }

    console.log(
      `Seeded ${property.code} (${property.name}) with outlets: ${property.restaurant}, ${property.spa}`,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
