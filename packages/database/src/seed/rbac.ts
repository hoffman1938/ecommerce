import type { PrismaClient } from '@prisma/client';
import { PERMISSION_KEYS, ROLE_DEFINITIONS } from '@outlet/types';

// The catalogue itself lives in @outlet/types so that this seed, the D1 seed
// and the Cloudflare Worker that enforces the checks at request time all read
// one list. Re-exported here because callers already import it from this path.
export { PERMISSION_KEYS, ROLE_DEFINITIONS };

export async function seedRbac(prisma: PrismaClient): Promise<void> {
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: `Allows ${key}` },
      update: {},
    });
  }
  const permissions = await prisma.permission.findMany();
  const byKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const [name, keys] of Object.entries(ROLE_DEFINITIONS)) {
    const role = await prisma.role.upsert({
      where: { name },
      create: { name, isSystem: true, description: `${name} role` },
      update: {},
    });
    // Re-sync role permissions to the definition above.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: keys
        .map((k) => byKey.get(k))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }
  console.log('Seeded RBAC roles and permissions');
}
