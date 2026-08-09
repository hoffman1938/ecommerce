/**
 * Shared string-literal enums. These mirror the Prisma enums so browser code
 * never needs to import the Prisma client.
 */

export const CampaignStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const ProductStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus];

export const TargetGroup = {
  MEN: 'MEN',
  WOMEN: 'WOMEN',
  KIDS: 'KIDS',
  UNISEX: 'UNISEX',
} as const;
export type TargetGroup = (typeof TargetGroup)[keyof typeof TargetGroup];

export const TaxClass = {
  STANDARD: 'STANDARD',
  REDUCED: 'REDUCED',
  ZERO: 'ZERO',
} as const;
export type TaxClass = (typeof TaxClass)[keyof typeof TaxClass];

export const ReservationStatus = {
  ACTIVE: 'ACTIVE',
  CHECKOUT_STARTED: 'CHECKOUT_STARTED',
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  CONVERTED: 'CONVERTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReservationStatus = (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const CartStatus = {
  ACTIVE: 'ACTIVE',
  CONVERTED: 'CONVERTED',
  MERGED: 'MERGED',
  ABANDONED: 'ABANDONED',
} as const;
export type CartStatus = (typeof CartStatus)[keyof typeof CartStatus];

export const OrderStatus = {
  DRAFT: 'DRAFT',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAID: 'PAID',
  PROCESSING: 'PROCESSING',
  PACKED: 'PACKED',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURN_REQUESTED: 'RETURN_REQUESTED',
  PARTIALLY_RETURNED: 'PARTIALLY_RETURNED',
  RETURNED: 'RETURNED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  AUTHORIZED: 'AUTHORIZED',
  PAID: 'PAID',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const RefundStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];

export const ReturnStatus = {
  REQUESTED: 'REQUESTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RECEIVED: 'RECEIVED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type ReturnStatus = (typeof ReturnStatus)[keyof typeof ReturnStatus];

export const ReturnItemCondition = {
  UNINSPECTED: 'UNINSPECTED',
  RESELLABLE: 'RESELLABLE',
  DAMAGED: 'DAMAGED',
} as const;
export type ReturnItemCondition = (typeof ReturnItemCondition)[keyof typeof ReturnItemCondition];

export const ShipmentStatus = {
  PENDING: 'PENDING',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
} as const;
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];

export const InventoryMovementType = {
  INITIAL: 'INITIAL',
  RESTOCK: 'RESTOCK',
  ADJUSTMENT_INCREASE: 'ADJUSTMENT_INCREASE',
  ADJUSTMENT_DECREASE: 'ADJUSTMENT_DECREASE',
  CORRECTION: 'CORRECTION',
  DAMAGED: 'DAMAGED',
  SALE: 'SALE',
  RETURN_RESTOCK: 'RETURN_RESTOCK',
  RELEASE: 'RELEASE',
} as const;
export type InventoryMovementType =
  (typeof InventoryMovementType)[keyof typeof InventoryMovementType];

export const CouponType = {
  FIXED: 'FIXED',
  PERCENTAGE: 'PERCENTAGE',
} as const;
export type CouponType = (typeof CouponType)[keyof typeof CouponType];

export const AddressType = {
  SHIPPING: 'SHIPPING',
  BILLING: 'BILLING',
  BOTH: 'BOTH',
} as const;
export type AddressType = (typeof AddressType)[keyof typeof AddressType];

export const ShippingMethod = {
  STANDARD: 'STANDARD',
  EXPRESS: 'EXPRESS',
} as const;
export type ShippingMethod = (typeof ShippingMethod)[keyof typeof ShippingMethod];

export const MockPaymentOutcome = {
  SUCCESS: 'TEST-SUCCESS',
  FAIL: 'TEST-FAIL',
  CANCEL: 'TEST-CANCEL',
  DELAYED: 'TEST-DELAYED',
} as const;
export type MockPaymentOutcome = (typeof MockPaymentOutcome)[keyof typeof MockPaymentOutcome];

/** Permission keys used by role-based access control. */
export const Permissions = {
  ProductsView: 'products.view',
  ProductsCreate: 'products.create',
  ProductsUpdate: 'products.update',
  ProductsArchive: 'products.archive',
  InventoryView: 'inventory.view',
  InventoryAdjust: 'inventory.adjust',
  ReservationsView: 'reservations.view',
  ReservationsCancel: 'reservations.cancel',
  OrdersView: 'orders.view',
  OrdersUpdate: 'orders.update',
  OrdersCancel: 'orders.cancel',
  RefundsCreate: 'refunds.create',
  ReturnsView: 'returns.view',
  ReturnsManage: 'returns.manage',
  CampaignsView: 'campaigns.view',
  CampaignsManage: 'campaigns.manage',
  CampaignsPublish: 'campaigns.publish',
  CustomersView: 'customers.view',
  CustomersDisable: 'customers.disable',
  CustomersSupport: 'customers.support',
  CouponsView: 'coupons.view',
  CouponsManage: 'coupons.manage',
  ReviewsView: 'reviews.view',
  ReviewsModerate: 'reviews.moderate',
  ReviewsReply: 'reviews.reply',
  ReviewsDelete: 'reviews.delete',
  ContentManage: 'content.manage',
  SettingsUpdate: 'settings.update',
  AuditLogsView: 'audit_logs.view',
  DashboardView: 'dashboard.view',
  AdminUsersManage: 'admin_users.manage',
} as const;
export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

/** Built-in role names created by the seed. */
export const RoleNames = {
  SuperAdmin: 'Super Admin',
  CatalogManager: 'Catalog Manager',
  InventoryManager: 'Inventory Manager',
  OrderManager: 'Order Manager',
  CustomerSupport: 'Customer Support',
  Moderator: 'Moderator',
  MarketingManager: 'Marketing Manager',
  FinanceManager: 'Finance Manager',
  ReadOnlyAnalyst: 'Read-only Analyst',
} as const;
export type RoleName = (typeof RoleNames)[keyof typeof RoleNames];
