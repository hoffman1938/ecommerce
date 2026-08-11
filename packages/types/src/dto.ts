/**
 * API response shapes shared between the backend and both frontends.
 * All money values are integer minor units (e.g. cents).
 */
import type {
  CampaignStatus,
  CategoryLevel,
  CategoryStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  RefundStatus,
  ReservationStatus,
  ReturnItemCondition,
  ReturnStatus,
  ShipmentStatus,
  ShippingMethod,
  SizeChartGroup,
  TargetGroup,
  TaxClass,
} from './enums';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  code?: string;
}

// --- Catalog ---------------------------------------------------------------

export interface BrandDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  /** Card artwork for brand tiles and the brand page header. */
  imageUrl: string | null;
  isFeatured: boolean;
}

/**
 * One node of the category tree, as the storefront receives it.
 *
 * Only categories a customer can actually reach are ever returned here —
 * active, with an active ancestry, and holding at least one available product.
 * `productCount` is the rolled-up figure including descendants, which is what
 * makes "Shoes" disappear when every kind of shoe beneath it has sold out of
 * the catalogue.
 */
export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  /** URL fragment within the parent: `dresses` in /shop/women/clothing/dresses. */
  pathSegment: string;
  /** Segments from the department down to this node. */
  path: string[];
  /** Ready-made storefront link, so no caller reassembles the path by hand. */
  href: string;
  targetGroup: TargetGroup;
  level: CategoryLevel;
  /** Null when products here are not sized — bags, wallets, footwear. */
  sizeChartGroup: SizeChartGroup | null;
  /** Available products on this node and everything beneath it. */
  productCount: number;
  /** Tile artwork for visual category navigation. */
  imageUrl: string | null;
  children: CategoryDto[];
}

/**
 * The same tree as an administrator sees it: nothing pruned, and the two
 * reasons a category can be invisible reported separately.
 */
export interface AdminCategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  pathSegment: string;
  path: string[];
  href: string;
  targetGroup: TargetGroup;
  level: CategoryLevel;
  sizeChartGroup: SizeChartGroup | null;
  description: string | null;
  /** The administrator's own switch. False means deliberately hidden. */
  isActive: boolean;
  status: CategoryStatus;
  /** True when a customer can currently reach it. */
  isVisible: boolean;
  /** Products attached to this node itself. */
  directProductCount: number;
  /** Products on this node and everything beneath it. */
  productCount: number;
  /** Products of any status attached to this node itself, for delete warnings. */
  totalProductCount: number;
  children: AdminCategoryDto[];
}

export interface ProductImageDto {
  id: string;
  url: string;
  altText: string | null;
  position: number;
  variantId: string | null;
}

export interface VariantDto {
  id: string;
  sku: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  priceMinor: number;
  isEnabled: boolean;
  availableQuantity: number;
  attributes: Record<string, string> | null;
}

export interface ProductListItemDto {
  id: string;
  name: string;
  slug: string;
  brand: { id: string; name: string; slug: string };
  category: { id: string; name: string; slug: string } | null;
  targetGroup: TargetGroup;
  originalPriceMinor: number;
  currentPriceMinor: number;
  discountPercent: number;
  currencyCode: string;
  imageUrl: string | null;
  /**
   * A second shot, revealed when a listing tile is hovered. Null when the
   * product only has one image.
   */
  hoverImageUrl: string | null;
  /** Colourways offered, so a tile can say "3 colours" without a second call. */
  colors: string[];
  campaignId: string | null;
  campaignSlug: string | null;
  totalAvailable: number;
  /** Mean of published review ratings, rounded to 1dp. Null when unreviewed. */
  ratingAverage: number | null;
  reviewCount: number;
  createdAt: string;
}

export interface ProductDetailDto extends ProductListItemDto {
  /**
   * Which size chart applies, inherited from the product's category. Null for
   * anything that is not a sized garment — footwear, bags, accessories — and
   * the signal the product page uses to leave the size guide out entirely
   * rather than render an empty table.
   */
  sizeChartGroup: SizeChartGroup | null;
  shortDescription: string | null;
  description: string | null;
  materials: string | null;
  careInstructions: string | null;
  countryOfOrigin: string | null;
  status: ProductStatus;
  taxClass: TaxClass;
  seoTitle: string | null;
  seoDescription: string | null;
  images: ProductImageDto[];
  variants: VariantDto[];
}

/** Type-ahead results for the header search box. */
export interface SearchSuggestionsDto {
  products: Array<{
    name: string;
    slug: string;
    imageUrl: string | null;
    currentPriceMinor: number;
  }>;
  brands: Array<{ name: string; slug: string }>;
  categories: Array<{ name: string; slug: string }>;
}

export interface ReviewDto {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  authorName: string;
  isVerifiedPurchase: boolean;
  helpfulCount: number;
  createdAt: string;
  /** Shop response written in the admin panel; null when unanswered. */
  adminReply: string | null;
  adminReplyAt: string | null;
}

/** Rating breakdown for the histogram on a product page. */
export interface ReviewSummaryDto {
  ratingAverage: number | null;
  reviewCount: number;
  /** Count of published reviews per star value, keyed "1".."5". */
  distribution: Record<string, number>;
  verifiedCount: number;
}

export interface ProductReviewsDto extends ReviewSummaryDto {
  items: ReviewDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CampaignDto {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  coverImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  status: CampaignStatus;
  position: number;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount?: number;
}

// --- Cart ------------------------------------------------------------------

export interface CartItemDto {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  brandName: string;
  sku: string;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  originalUnitPriceMinor: number;
  lineTotalMinor: number;
  campaignId: string | null;
  campaignTitle: string | null;
  reservation: {
    id: string;
    status: ReservationStatus;
    /** Authoritative server-side expiration timestamp (ISO 8601). */
    expiresAt: string;
    /** Seconds remaining at response time; frontend timers are cosmetic. */
    secondsRemaining: number;
  } | null;
  isExpired: boolean;
  message: string | null;
}

/** Progress toward the free-shipping threshold, computed server-side. */
export interface FreeShippingProgressDto {
  thresholdMinor: number;
  /** 0 once the threshold is met. */
  remainingMinor: number;
  qualified: boolean;
}

export interface DeliveryEstimateDto {
  /** Earliest expected delivery date, ISO 8601 (date only). */
  earliest: string;
  latest: string;
  /** Shipping method the estimate assumes. */
  method: ShippingMethod;
}

export interface CartDto {
  id: string;
  items: CartItemDto[];
  /** Items the customer parked; they hold no stock reservation. */
  savedForLater: CartItemDto[];
  currencyCode: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  couponCode: string | null;
  couponDiscountMinor: number;
  itemCount: number;
  freeShipping: FreeShippingProgressDto;
  /** Null when the cart is empty. */
  deliveryEstimate: DeliveryEstimateDto | null;
  messages: string[];
}

// --- Checkout / orders -----------------------------------------------------

export interface AddressDto {
  id?: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string | null;
  city: string;
  region?: string | null;
  postalCode: string;
  countryCode: string;
  phone?: string | null;
}

export interface ShippingMethodDto {
  id: ShippingMethod;
  label: string;
  priceMinor: number;
  estimatedDays: string;
}

export interface CheckoutQuoteDto {
  cart: CartDto;
  shippingMethods: ShippingMethodDto[];
  /** Earliest reservation expiration across cart items (ISO 8601). */
  reservationDeadline: string | null;
}

export interface PaymentSessionDto {
  paymentId: string;
  orderId: string;
  provider: string;
  /** URL the browser should navigate to in order to complete payment. */
  redirectUrl: string;
  amountMinor: number;
  currencyCode: string;
}

export interface OrderItemDto {
  id: string;
  name: string;
  sku: string;
  brandName: string | null;
  size: string | null;
  color: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
  returnedQuantity: number;
  returnableQuantity: number;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currencyCode: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  couponCode: string | null;
  email: string;
  shippingAddress: AddressDto;
  billingAddress: AddressDto;
  shippingMethod: ShippingMethod;
  items: OrderItemDto[];
  payments: PaymentSummaryDto[];
  shipments: ShipmentDto[];
  /** Every status the order has passed through, oldest first. */
  timeline: OrderTimelineEntryDto[];
  placedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  /** Whether the customer can still cancel from their order page. */
  isCancellable: boolean;
  createdAt: string;
}

export interface OrderTimelineEntryDto {
  status: OrderStatus;
  at: string;
  note: string | null;
}

/** One carrier scan on a shipment's tracking history. */
export interface ShipmentEventDto {
  code: string;
  label: string;
  at: string;
  location: string | null;
}

export interface PaymentSummaryDto {
  id: string;
  provider: string;
  status: PaymentStatus;
  amountMinor: number;
  refundedAmountMinor: number;
  failureReason: string | null;
  createdAt: string;
}

export interface ShipmentDto {
  id: string;
  carrier: string | null;
  trackingNumber: string | null;
  status: ShipmentStatus;
  shippedAt: string | null;
  deliveredAt: string | null;
  events: ShipmentEventDto[];
}

export interface ReturnRequestDto {
  id: string;
  rmaNumber: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  reason: string;
  customerNote: string | null;
  items: ReturnItemDto[];
  refunds: RefundDto[];
  createdAt: string;
}

export interface ReturnItemDto {
  id: string;
  orderItemId: string;
  name: string;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  restockedQuantity: number;
  condition: ReturnItemCondition;
  reason: string | null;
}

export interface RefundDto {
  id: string;
  amountMinor: number;
  status: RefundStatus;
  reason: string | null;
  createdAt: string;
}

// --- Account ---------------------------------------------------------------

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  createdAt: string;
}

export interface AdminUserDto extends UserDto {
  roles: string[];
  permissions: string[];
}

export interface NotificationPreferencesDto {
  orderUpdates: boolean;
  campaignAnnouncements: boolean;
  newsletter: boolean;
}

// --- Admin -----------------------------------------------------------------

export interface DashboardStatsDto {
  revenueMinor: number;
  orderCount: number;
  averageOrderValueMinor: number;
  lowStockCount: number;
  activeReservationCount: number;
  expiredReservationCount: number;
  failedPaymentCount: number;
  activeCampaignCount: number;
  upcomingCampaignCount: number;
  openReturnCount: number;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    email: string;
    totalMinor: number;
    status: OrderStatus;
    placedAt: string;
  }>;
  salesByDay: Array<{ day: string; revenueMinor: number; orderCount: number }>;
  salesByBrand: Array<{ brandName: string; revenueMinor: number; unitsSold: number }>;
  salesByCampaign: Array<{ campaignTitle: string; revenueMinor: number; unitsSold: number }>;
  lowStockVariants: Array<{
    variantId: string;
    sku: string;
    productName: string;
    availableQuantity: number;
  }>;
}

export interface InventoryRowDto {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  brandName: string;
  size: string | null;
  color: string | null;
  onHandQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  damagedQuantity: number;
  returnedQuantity: number;
  availableQuantity: number;
  isEnabled: boolean;
}

export interface InventoryMovementDto {
  id: string;
  variantId: string;
  sku: string;
  type: string;
  quantityChange: number;
  previousOnHand: number;
  newOnHand: number;
  reason: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export interface ReservationAdminDto {
  id: string;
  sku: string;
  productName: string;
  quantity: number;
  status: ReservationStatus;
  customerEmail: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface AuditLogDto {
  id: string;
  actorEmail: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  createdAt: string;
}
