/**
 * The role/permission catalogue, as data.
 *
 * It lives here rather than beside a seed script because three unrelated
 * consumers need to agree on it exactly: the PostgreSQL seed, the D1 seed, and
 * the Cloudflare Worker that enforces the checks at request time. When these
 * lists lived next to one seed, "the role exists but grants nothing" was a
 * failure mode nobody noticed until an admin screen returned 403.
 *
 * This module intentionally has no dependencies — the Worker cannot import
 * anything that reaches for Prisma or the Node standard library.
 */

import { Permissions, type PermissionKey } from './enums';

export const PERMISSION_KEYS: readonly PermissionKey[] = Object.values(Permissions);

const VIEW_ONLY = PERMISSION_KEYS.filter(
  (key) => key.endsWith('.view') || key === Permissions.DashboardView,
);

/**
 * Which permissions each built-in role holds.
 *
 * Roles are scoped to a job rather than to a seniority level: an Inventory
 * Manager can move stock but cannot see an order's payment, and a Moderator —
 * the one role that removes customer-authored content from the storefront —
 * needs no access to orders, money or inventory to do it.
 */
export const ROLE_DEFINITIONS: Record<string, readonly PermissionKey[]> = {
  'Super Admin': PERMISSION_KEYS,
  'Catalog Manager': [
    Permissions.DashboardView,
    Permissions.ProductsView,
    Permissions.ProductsCreate,
    Permissions.ProductsUpdate,
    Permissions.ProductsArchive,
    Permissions.CampaignsView,
    Permissions.InventoryView,
    Permissions.CouponsView,
  ],
  'Inventory Manager': [
    Permissions.DashboardView,
    Permissions.ProductsView,
    Permissions.InventoryView,
    Permissions.InventoryAdjust,
    Permissions.ReservationsView,
    Permissions.ReservationsCancel,
  ],
  'Order Manager': [
    Permissions.DashboardView,
    Permissions.OrdersView,
    Permissions.OrdersUpdate,
    Permissions.OrdersCancel,
    Permissions.ReturnsView,
    Permissions.ReturnsManage,
    Permissions.CustomersView,
    Permissions.InventoryView,
  ],
  'Customer Support': [
    Permissions.DashboardView,
    Permissions.OrdersView,
    Permissions.CustomersView,
    Permissions.CustomersSupport,
    Permissions.ReturnsView,
    Permissions.ReservationsView,
    // Support answers reviews as the shop, but does not decide what stays up.
    Permissions.ReviewsView,
    Permissions.ReviewsReply,
  ],
  Moderator: [
    Permissions.DashboardView,
    Permissions.ProductsView,
    Permissions.CustomersView,
    Permissions.ReviewsView,
    Permissions.ReviewsModerate,
    Permissions.ReviewsReply,
    Permissions.ReviewsDelete,
  ],
  'Marketing Manager': [
    Permissions.DashboardView,
    Permissions.CampaignsView,
    Permissions.CampaignsManage,
    Permissions.CampaignsPublish,
    Permissions.CouponsView,
    Permissions.CouponsManage,
    Permissions.ContentManage,
    Permissions.ProductsView,
    Permissions.ReviewsView,
  ],
  'Finance Manager': [
    Permissions.DashboardView,
    Permissions.OrdersView,
    Permissions.RefundsCreate,
    Permissions.ReturnsView,
    Permissions.AuditLogsView,
  ],
  'Read-only Analyst': VIEW_ONLY,
};

/** Names of the roles this catalogue defines. `RoleNames` in ./enums is the
 *  constant map the rest of the code refers to them by. */
export type DefinedRoleName = keyof typeof ROLE_DEFINITIONS;
