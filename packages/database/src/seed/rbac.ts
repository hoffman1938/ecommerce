import type { PrismaClient } from '@prisma/client';

/** Permission catalog; mirrored in @outlet/types Permissions. */
export const PERMISSION_KEYS = [
  'products.view',
  'products.create',
  'products.update',
  'products.archive',
  'inventory.view',
  'inventory.adjust',
  'reservations.view',
  'reservations.cancel',
  'orders.view',
  'orders.update',
  'orders.cancel',
  'refunds.create',
  'returns.view',
  'returns.manage',
  'campaigns.view',
  'campaigns.manage',
  'campaigns.publish',
  'customers.view',
  'customers.disable',
  'customers.support',
  'coupons.view',
  'coupons.manage',
  'content.manage',
  'settings.update',
  'audit_logs.view',
  'dashboard.view',
  'admin_users.manage',
] as const;

const VIEW_ONLY = PERMISSION_KEYS.filter((k) => k.endsWith('.view') || k === 'dashboard.view');

export const ROLE_DEFINITIONS: Record<string, readonly string[]> = {
  'Super Admin': PERMISSION_KEYS,
  'Catalog Manager': [
    'dashboard.view',
    'products.view',
    'products.create',
    'products.update',
    'products.archive',
    'campaigns.view',
    'inventory.view',
    'coupons.view',
  ],
  'Inventory Manager': [
    'dashboard.view',
    'products.view',
    'inventory.view',
    'inventory.adjust',
    'reservations.view',
    'reservations.cancel',
  ],
  'Order Manager': [
    'dashboard.view',
    'orders.view',
    'orders.update',
    'orders.cancel',
    'returns.view',
    'returns.manage',
    'customers.view',
    'inventory.view',
  ],
  'Customer Support': [
    'dashboard.view',
    'orders.view',
    'customers.view',
    'customers.support',
    'returns.view',
    'reservations.view',
  ],
  'Marketing Manager': [
    'dashboard.view',
    'campaigns.view',
    'campaigns.manage',
    'campaigns.publish',
    'coupons.view',
    'coupons.manage',
    'content.manage',
    'products.view',
  ],
  'Finance Manager': [
    'dashboard.view',
    'orders.view',
    'refunds.create',
    'returns.view',
    'audit_logs.view',
  ],
  'Read-only Analyst': VIEW_ONLY,
};

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
