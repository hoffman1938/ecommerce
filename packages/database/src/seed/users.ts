import type { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

interface SeedUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  roles: string[];
  verified: boolean;
  /**
   * Re-hash and overwrite the password on every seed run.
   *
   * The placeholder accounts below deliberately do not do this: once a
   * developer changes a local password, re-seeding should not silently put it
   * back. The owner account does, so that rotating the environment variable
   * and re-running the seed is an actual password rotation.
   */
  rotatePassword?: boolean;
}

// LOCAL SEED CREDENTIALS ONLY. Documented in the README; never use in
// production.
const SEED_USERS: SeedUser[] = [
  {
    email: 'admin@example.local',
    password: 'Admin123!',
    firstName: 'Ada',
    lastName: 'Admin',
    roles: ['Super Admin'],
    verified: true,
  },
  {
    email: 'catalog@example.local',
    password: 'Admin123!',
    firstName: 'Carl',
    lastName: 'Catalog',
    roles: ['Catalog Manager'],
    verified: true,
  },
  {
    email: 'inventory@example.local',
    password: 'Admin123!',
    firstName: 'Ivy',
    lastName: 'Inventory',
    roles: ['Inventory Manager'],
    verified: true,
  },
  {
    email: 'orders@example.local',
    password: 'Admin123!',
    firstName: 'Omar',
    lastName: 'Orders',
    roles: ['Order Manager'],
    verified: true,
  },
  {
    email: 'support@example.local',
    password: 'Admin123!',
    firstName: 'Sue',
    lastName: 'Support',
    roles: ['Customer Support'],
    verified: true,
  },
  {
    email: 'marketing@example.local',
    password: 'Admin123!',
    firstName: 'Mia',
    lastName: 'Marketing',
    roles: ['Marketing Manager'],
    verified: true,
  },
  {
    email: 'finance@example.local',
    password: 'Admin123!',
    firstName: 'Finn',
    lastName: 'Finance',
    roles: ['Finance Manager'],
    verified: true,
  },
  {
    email: 'analyst@example.local',
    password: 'Admin123!',
    firstName: 'Anna',
    lastName: 'Analyst',
    roles: ['Read-only Analyst'],
    verified: true,
  },
  {
    email: 'customer@example.local',
    password: 'Customer123!',
    firstName: 'Nino',
    lastName: 'Customer',
    roles: [],
    verified: true,
  },
  {
    email: 'customer2@example.local',
    password: 'Customer123!',
    firstName: 'Giorgi',
    lastName: 'Shopper',
    roles: [],
    verified: true,
  },
];

/**
 * The real owner account, supplied by environment rather than source.
 *
 * Every account above is a throwaway `*.example.local` placeholder, safe to
 * commit precisely because it is fake. A genuine administrator credential is
 * not, so it is read from `.env` — which is gitignored — and the repository
 * never carries it. Set both variables to enable it:
 *
 *   SEED_SUPERADMIN_EMAIL=you@example.com
 *   SEED_SUPERADMIN_PASSWORD=<a password you use nowhere else>
 *
 * Leave either unset and the seed behaves exactly as before.
 */
function ownerFromEnv(): SeedUser | null {
  const email = process.env.SEED_SUPERADMIN_EMAIL?.trim();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!email || !password) return null;

  return {
    email: email.toLowerCase(),
    password,
    firstName: process.env.SEED_SUPERADMIN_FIRST_NAME?.trim() || 'Super',
    lastName: process.env.SEED_SUPERADMIN_LAST_NAME?.trim() || 'Admin',
    roles: ['Super Admin'],
    verified: true,
    rotatePassword: true,
  };
}

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  const owner = ownerFromEnv();
  const users = owner ? [...SEED_USERS, owner] : SEED_USERS;

  for (const seedUser of users) {
    const passwordHash = await argon2.hash(seedUser.password);
    const user = await prisma.user.upsert({
      where: { email: seedUser.email },
      create: {
        email: seedUser.email,
        passwordHash,
        firstName: seedUser.firstName,
        lastName: seedUser.lastName,
        isEmailVerified: seedUser.verified,
        emailVerifiedAt: seedUser.verified ? new Date() : null,
      },
      update: seedUser.rotatePassword
        ? {
            passwordHash,
            isEmailVerified: seedUser.verified,
            emailVerifiedAt: seedUser.verified ? new Date() : null,
            // A locked-out owner must be recoverable by re-running the seed.
            status: 'ACTIVE',
            failedLoginAttempts: 0,
            lockedUntil: null,
            disabledReason: null,
          }
        : {},
    });

    if (seedUser.roles.length > 0) {
      const roles = await prisma.role.findMany({ where: { name: { in: seedUser.roles } } });
      for (const role of roles) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          create: { userId: user.id, roleId: role.id },
          update: {},
        });
      }
    }
  }

  // Give the main customer a saved address for checkout convenience.
  const customer = await prisma.user.findUnique({ where: { email: 'customer@example.local' } });
  if (customer) {
    const existing = await prisma.address.findFirst({ where: { userId: customer.id } });
    if (!existing) {
      await prisma.address.create({
        data: {
          userId: customer.id,
          type: 'BOTH',
          firstName: customer.firstName,
          lastName: customer.lastName,
          line1: 'Example Street 12',
          city: 'Berlin',
          postalCode: '10115',
          countryCode: 'DE',
          phone: '+49 30 0000000',
          isDefaultShipping: true,
          isDefaultBilling: true,
        },
      });
    }
  }
  console.log('Seeded users and admin accounts');
}
