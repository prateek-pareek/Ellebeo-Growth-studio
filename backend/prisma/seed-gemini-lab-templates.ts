import { PrismaClient } from '@prisma/client';
import { builtinLibrary } from '../src/gemini-lab/template-store';

/**
 * Writes the shared layout library into the database. Idempotent.
 *
 * Uses findFirst + create/update rather than an upsert on (tenantId, key):
 * Prisma will not accept a null inside a compound unique lookup, and the
 * shared library is precisely the rows whose tenant is null. Uniqueness for
 * those is enforced by a partial index in the migration instead.
 */
async function main() {
  const prisma = new PrismaClient();
  const rows = builtinLibrary();
  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await prisma.geminiLabTemplate.findFirst({
      where: { tenantId: null, key: row.key },
      select: { id: true },
    });
    const data = {
      name: row.name,
      intent: row.intent,
      photoMode: row.photoMode,
      regions: row.regions as any,
      defaults: row.defaults as any,
      allows: row.allows as any,
      suits: row.suits,
      sortOrder: row.sortOrder,
    };
    if (existing) {
      await prisma.geminiLabTemplate.update({ where: { id: existing.id }, data });
      updated += 1;
    } else {
      await prisma.geminiLabTemplate.create({ data: { ...data, key: row.key, source: 'builtin' } });
      created += 1;
    }
  }
  const count = await prisma.geminiLabTemplate.count({ where: { tenantId: null } });
  console.log(`SEEDED created=${created} updated=${updated}; shared library holds ${count}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
