/**
 * The demo database, as SQL.
 *
 * Everything a reviewer sees comes from here: the catalogue, the people who
 * bought from it, what they said about it afterwards, and the stock that
 * movement left behind. It is generated rather than hand-written so the
 * relationships are real — an order's items point at variants that exist, the
 * stock those orders consumed is actually missing from the shelf, and the
 * review counts on a product row match the review rows beneath it.
 *
 * Two properties are deliberate:
 *
 *  - **Deterministic.** Seeded PRNGs, ids derived from natural keys, and dates
 *    anchored to midnight. Re-running on the same day produces byte-identical
 *    SQL, so "did the data change or did my code?" always has an answer.
 *  - **Idempotent.** Every statement is `ON CONFLICT DO NOTHING` or an explicit
 *    upsert, so `db:seed` can be run twice without duplicating anything.
 *
 * Passwords are never written here. The caller passes in already-derived
 * PBKDF2 hashes, and the plaintext comes from the environment.
 */

import * as catalogModule from '@outlet/catalog';
import * as domainModule from '@outlet/domain';
import * as typesModule from '@outlet/types';
import { daysAgo, daysAhead, insert, iso, makeRandom, pick, upsert } from './rows.mjs';

/*
 * The workspace packages compile to CommonJS. Plain Node ESM exposes that as a
 * single `default` binding, while Vite (which the test suite runs this through)
 * detects the named exports instead. Taking the namespace and unwrapping any
 * `default` covers both without a build step for either.
 */
const unwrap = (module) => module.default ?? module;
const catalog = unwrap(catalogModule);
const domain = unwrap(domainModule);
const types = unwrap(typesModule);

const {
  BRANDS,
  CAMPAIGNS,
  CATALOG_EPOCH,
  CATEGORIES,
  CONTENT_PAGES,
  COUPONS,
  CURRENCY_CODE,
  DEFAULT_CARE_INSTRUCTIONS,
  DEFAULT_COUNTRY_OF_ORIGIN,
  PRODUCTS,
  PRODUCT_VIEWS,
  SETTINGS,
  descriptionFor,
  productArtworkAlt,
  quantityFor,
  skuFor,
} = catalog;

const { aggregateReviews, generateReviews, reviewKindForCategory, computeCartTotals } = domain;

// Permission/role catalogue, shared with the Worker that enforces it.
const { PERMISSION_KEYS, ROLE_DEFINITIONS } = types;

// --- Identifiers -------------------------------------------------------------
// Derived from natural keys rather than random, which is what makes the seed
// idempotent and makes a failing row traceable to the thing it describes.

const idFor = (prefix, key) => `${prefix}_${key.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()}`;
const brandId = (slug) => idFor('brand', slug);
const categoryId = (slug) => idFor('cat', slug);
const productId = (slug) => idFor('prod', slug);
const variantId = (sku) => idFor('var', sku);
const userId = (email) => idFor('usr', email.split('@')[0]);
const campaignId = (slug) => idFor('camp', slug);
const couponId = (code) => idFor('cpn', code);

const DAY_MS = 24 * 60 * 60 * 1000;

// --- People ------------------------------------------------------------------

/**
 * Staff accounts, one per role, so the RBAC screens have something to show and
 * a reviewer can sign in as a limited user and watch the admin panel refuse
 * them. Every address is invented; no row here describes a real person.
 */
const STAFF = [
  { email: 'admin@demo.local', firstName: 'Ada', lastName: 'Keller', role: 'Super Admin' },
  { email: 'catalog@demo.local', firstName: 'Bruno', lastName: 'Marsh', role: 'Catalog Manager' },
  {
    email: 'inventory@demo.local',
    firstName: 'Cara',
    lastName: 'Nilsen',
    role: 'Inventory Manager',
  },
  { email: 'orders@demo.local', firstName: 'Dario', lastName: 'Peic', role: 'Order Manager' },
  { email: 'support@demo.local', firstName: 'Elin', lastName: 'Roos', role: 'Customer Support' },
  { email: 'moderator@demo.local', firstName: 'Faris', lastName: 'Aydin', role: 'Moderator' },
  {
    email: 'marketing@demo.local',
    firstName: 'Greta',
    lastName: 'Lind',
    role: 'Marketing Manager',
  },
  { email: 'finance@demo.local', firstName: 'Hugo', lastName: 'Bassi', role: 'Finance Manager' },
  { email: 'analyst@demo.local', firstName: 'Iris', lastName: 'Vogt', role: 'Read-only Analyst' },
];

const CUSTOMERS = [
  {
    email: 'customer@demo.local',
    firstName: 'Nina',
    lastName: 'Ortiz',
    city: 'Lisbon',
    countryCode: 'PT',
  },
  {
    email: 'jonas.weber@demo.local',
    firstName: 'Jonas',
    lastName: 'Weber',
    city: 'Berlin',
    countryCode: 'DE',
  },
  {
    email: 'sofia.rossi@demo.local',
    firstName: 'Sofia',
    lastName: 'Rossi',
    city: 'Milan',
    countryCode: 'IT',
  },
  {
    email: 'lucas.martin@demo.local',
    firstName: 'Lucas',
    lastName: 'Martin',
    city: 'Lyon',
    countryCode: 'FR',
  },
  {
    email: 'emma.novak@demo.local',
    firstName: 'Emma',
    lastName: 'Novak',
    city: 'Prague',
    countryCode: 'CZ',
  },
  {
    email: 'oliver.hayes@demo.local',
    firstName: 'Oliver',
    lastName: 'Hayes',
    city: 'Manchester',
    countryCode: 'GB',
  },
  {
    email: 'maja.olsen@demo.local',
    firstName: 'Maja',
    lastName: 'Olsen',
    city: 'Oslo',
    countryCode: 'NO',
  },
  {
    email: 'tomas.silva@demo.local',
    firstName: 'Tomas',
    lastName: 'Silva',
    city: 'Porto',
    countryCode: 'PT',
  },
  {
    email: 'aylin.demir@demo.local',
    firstName: 'Aylin',
    lastName: 'Demir',
    city: 'Rotterdam',
    countryCode: 'NL',
  },
  {
    email: 'pablo.ferrer@demo.local',
    firstName: 'Pablo',
    lastName: 'Ferrer',
    city: 'Valencia',
    countryCode: 'ES',
  },
  {
    email: 'hanna.koch@demo.local',
    firstName: 'Hanna',
    lastName: 'Koch',
    city: 'Vienna',
    countryCode: 'AT',
  },
  {
    email: 'ivan.petrov@demo.local',
    firstName: 'Ivan',
    lastName: 'Petrov',
    city: 'Sofia',
    countryCode: 'BG',
  },
];

const STREETS = [
  'Rua das Flores',
  'Lindenstrasse',
  'Via Garibaldi',
  'Rue Lafayette',
  'Havelska',
  'Deansgate',
  'Storgata',
  'Kalverstraat',
];

// --- Builder -----------------------------------------------------------------

export function buildSeed({ adminPasswordHash, customerPasswordHash, now = new Date() }) {
  // Anchored to midnight so two runs on the same day agree exactly.
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const statements = [];
  const emit = (sql) => statements.push(sql);
  const section = (title) => emit(`\n-- ${'-'.repeat(72)}\n-- ${title}\n-- ${'-'.repeat(72)}`);

  const counts = {};
  const bump = (key, n = 1) => {
    counts[key] = (counts[key] ?? 0) + n;
  };

  // --- RBAC ------------------------------------------------------------------
  section('Roles and permissions');
  for (const key of PERMISSION_KEYS) {
    emit(insert('permissions', { id: idFor('perm', key), key, description: `Allows ${key}` }));
    bump('permissions');
  }
  for (const [roleName, keys] of Object.entries(ROLE_DEFINITIONS)) {
    const rid = idFor('role', roleName);
    emit(
      insert('roles', { id: rid, name: roleName, description: `${roleName} role`, isSystem: 1 }),
    );
    bump('roles');
    for (const key of keys) {
      emit(insert('role_permissions', { roleId: rid, permissionId: idFor('perm', key) }));
    }
  }

  // --- Users -----------------------------------------------------------------
  section('Users, roles and addresses');

  for (const [index, person] of STAFF.entries()) {
    const uid = userId(person.email);
    emit(
      insert('users', {
        id: uid,
        email: person.email,
        passwordHash: person.role === 'Super Admin' ? adminPasswordHash : customerPasswordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        status: 'ACTIVE',
        isEmailVerified: 1,
        emailVerifiedAt: daysAgo(base, 200),
        notifyOrderUpdates: 1,
        notifyCampaigns: 0,
        createdAt: daysAgo(base, 200 - index),
        updatedAt: daysAgo(base, 200 - index),
      }),
    );
    emit(insert('user_roles', { userId: uid, roleId: idFor('role', person.role) }));
    bump('staff');
  }

  for (const [index, person] of CUSTOMERS.entries()) {
    const uid = userId(person.email);
    const joined = 150 - index * 9;
    emit(
      insert('users', {
        id: uid,
        email: person.email,
        passwordHash: customerPasswordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        status: 'ACTIVE',
        isEmailVerified: 1,
        emailVerifiedAt: daysAgo(base, joined),
        newsletterOptIn: index % 3 === 0 ? 1 : 0,
        createdAt: daysAgo(base, joined),
        updatedAt: daysAgo(base, joined),
      }),
    );
    emit(
      insert('addresses', {
        id: idFor('addr', person.email.split('@')[0]),
        userId: uid,
        type: 'BOTH',
        firstName: person.firstName,
        lastName: person.lastName,
        line1: `${STREETS[index % STREETS.length]} ${10 + index * 3}`,
        city: person.city,
        postalCode: `${1000 + index * 137}`,
        countryCode: person.countryCode,
        isDefaultShipping: 1,
        isDefaultBilling: 1,
        createdAt: daysAgo(base, joined),
        updatedAt: daysAgo(base, joined),
      }),
    );
    emit(
      insert('wishlists', {
        id: idFor('wl', person.email.split('@')[0]),
        userId: uid,
        createdAt: daysAgo(base, joined),
      }),
    );
    bump('customers');
  }

  // --- Catalogue -------------------------------------------------------------
  section('Brands');
  for (const brand of BRANDS) {
    emit(
      upsert(
        'brands',
        {
          id: brandId(brand.slug),
          name: brand.name,
          slug: brand.slug,
          description: `${brand.name} outlet deals.`,
          isFeatured: brand.isFeatured ? 1 : 0,
          isActive: 1,
          createdAt: CATALOG_EPOCH,
          updatedAt: CATALOG_EPOCH,
        },
        ['slug'],
        ['name', 'description', 'isFeatured'],
      ),
    );
    bump('brands');
  }

  section('Category tree');
  // CATEGORIES is emitted parents-first, so a child's parent always exists by
  // the time its row is inserted. `isActive` is left out of the update columns
  // on purpose: it is the administrator's switch, and re-seeding must not
  // silently un-hide a category somebody turned off.
  for (const category of CATEGORIES) {
    emit(
      upsert(
        'categories',
        {
          id: categoryId(category.slug),
          name: category.name,
          slug: category.slug,
          parentId: category.parentSlug ? categoryId(category.parentSlug) : null,
          pathSegment: category.pathSegment,
          targetGroup: category.targetGroup,
          position: category.position,
          sizeChartGroup: category.sizeChartGroup ?? null,
          isActive: 1,
          createdAt: CATALOG_EPOCH,
          updatedAt: CATALOG_EPOCH,
        },
        ['slug'],
        ['name', 'parentId', 'pathSegment', 'targetGroup', 'position', 'sizeChartGroup'],
      ),
    );
    bump('categories');
  }

  section('Products, variants, inventory and imagery');
  const brandBySlug = new Map(BRANDS.map((b) => [b.slug, b]));
  /** variantId -> mutable stock, so orders below can actually consume it. */
  const stock = new Map();
  /** productSlug -> [{ id, sku, color, size, priceMinor }] */
  const variantsByProduct = new Map();

  for (const [productIndex, spec] of PRODUCTS.entries()) {
    const pid = productId(spec.slug);
    const brand = brandBySlug.get(spec.brand);
    if (!brand) throw new Error(`Product ${spec.slug} references unknown brand ${spec.brand}`);

    emit(
      upsert(
        'products',
        {
          id: pid,
          name: spec.name,
          slug: spec.slug,
          brandId: brandId(spec.brand),
          categoryId: categoryId(spec.category),
          shortDescription: spec.shortDescription,
          description: descriptionFor(spec),
          targetGroup: spec.targetGroup,
          materials: spec.materials ?? null,
          careInstructions: spec.careInstructions ?? DEFAULT_CARE_INSTRUCTIONS,
          countryOfOrigin: spec.countryOfOrigin ?? DEFAULT_COUNTRY_OF_ORIGIN,
          originalPriceMinor: spec.originalPriceMinor,
          outletPriceMinor: spec.outletPriceMinor,
          currencyCode: CURRENCY_CODE,
          status: 'ACTIVE',
          publishedFrom: CATALOG_EPOCH,
          seoTitle: `${spec.name} | Outlet`,
          seoDescription: spec.shortDescription,
          searchKeywords: `${brand.name} ${spec.name} outlet sale ${spec.category.replace(/-/g, ' ')}`,
          createdAt: iso(new Date(Date.parse(CATALOG_EPOCH) + productIndex * DAY_MS)),
          updatedAt: CATALOG_EPOCH,
        },
        ['slug'],
        [
          'name',
          'brandId',
          'categoryId',
          'shortDescription',
          'description',
          'targetGroup',
          'materials',
          'careInstructions',
          'countryOfOrigin',
          'originalPriceMinor',
          'outletPriceMinor',
          'seoTitle',
          'seoDescription',
          'searchKeywords',
        ],
      ),
    );
    bump('products');

    const variants = [];
    let variantIndex = 0;
    for (const color of spec.colors) {
      for (const size of spec.sizes) {
        const sku = skuFor(spec, color, size);
        const vid = variantId(sku);
        emit(
          upsert(
            'product_variants',
            {
              id: vid,
              productId: pid,
              sku,
              size,
              color,
              isEnabled: 1,
              position: variantIndex,
              createdAt: CATALOG_EPOCH,
              updatedAt: CATALOG_EPOCH,
            },
            ['sku'],
            ['size', 'color', 'position'],
          ),
        );
        stock.set(vid, {
          onHand: quantityFor(spec.stock, variantIndex),
          sold: 0,
          returned: 0,
          damaged: 0,
        });
        variants.push({ id: vid, sku, color, size, priceMinor: spec.outletPriceMinor });
        variantIndex += 1;
        bump('variants');
      }
    }
    variantsByProduct.set(spec.slug, variants);

    /*
     * One image row per colourway per view. `objectKey` is the R2 key; `url`
     * points at the Worker's media route, which serves the object when it
     * exists and renders the same artwork on the fly when it does not — so the
     * storefront has no broken images even before anything is uploaded.
     */
    let position = 0;
    for (const color of spec.colors) {
      const colorVariant = variants.find((v) => v.color === color);
      for (const view of PRODUCT_VIEWS) {
        const key = `products/${spec.slug}/${color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${view}.svg`;
        emit(
          insert('product_images', {
            id: idFor('img', `${spec.slug}_${color}_${view}`),
            productId: pid,
            variantId: colorVariant?.id ?? null,
            url: `/media/${key}`,
            objectKey: key,
            altText: productArtworkAlt(spec.name, color, view),
            position,
            createdAt: CATALOG_EPOCH,
          }),
        );
        position += 1;
        bump('images');
      }
    }

    // --- Reviews -------------------------------------------------------------
    // Same deterministic generator the storefront demo used, so a product keeps
    // the rating it has always had. Every rating is stored, including the
    // majority with no written text — that is what a real store holds, and it
    // lets the histogram be computed from rows rather than trusted.
    const generated = generateReviews({
      slug: spec.slug,
      kind: reviewKindForCategory(spec.category),
    });
    if (generated.length > 0) {
      const aggregate = aggregateReviews(generated);
      for (const review of generated) {
        emit(
          insert('product_reviews', {
            id: idFor('rev', `${spec.slug}_${review.key}`),
            productId: pid,
            authorName: review.authorName,
            rating: review.rating,
            title: review.title ?? null,
            body: review.body,
            isVerifiedPurchase: review.isVerifiedPurchase ? 1 : 0,
            helpfulCount: review.helpfulCount,
            status: 'PUBLISHED',
            createdAt: daysAgo(base, review.daysAgo),
            updatedAt: daysAgo(base, review.daysAgo),
          }),
        );
        bump('reviews');
      }
      emit(
        `UPDATE "products" SET "ratingSum" = ${aggregate.ratingSum}, "reviewCount" = ${aggregate.reviewCount} WHERE "id" = '${pid}';`,
      );
    }
  }

  // A handful of reviews left unmoderated and one reported, so the moderation
  // queue in the admin panel is not an empty table.
  section('Reviews awaiting moderation');
  const moderationTargets = PRODUCTS.slice(0, 4);
  for (const [index, spec] of moderationTargets.entries()) {
    const customer = CUSTOMERS[index + 1];
    emit(
      insert('product_reviews', {
        id: idFor('rev', `pending_${spec.slug}`),
        productId: productId(spec.slug),
        userId: userId(customer.email),
        authorName: `${customer.firstName} ${customer.lastName[0]}.`,
        rating: index === 3 ? 2 : 4,
        title: index === 3 ? 'Not what I expected' : 'Good but sizing runs small',
        body:
          index === 3
            ? 'The colour is noticeably darker than the photos and the fit is tighter than the size chart suggests.'
            : 'Quality is genuinely good for the price. Order a size up if you are between sizes.',
        isVerifiedPurchase: 1,
        status: 'PENDING',
        reportCount: index === 3 ? 2 : 0,
        reportedAt: index === 3 ? daysAgo(base, 2) : null,
        createdAt: daysAgo(base, 3 + index),
        updatedAt: daysAgo(base, 3 + index),
      }),
    );
    bump('reviews');
  }

  // --- Campaigns -------------------------------------------------------------
  section('Campaigns');
  const productBySlug = new Map(PRODUCTS.map((spec) => [spec.slug, spec]));

  for (const campaign of CAMPAIGNS) {
    /*
     * A campaign's window is relative to seed time, so the demo always has a
     * running one, an upcoming one and a finished one whenever it is loaded.
     * Status is derived from the window rather than declared, because a
     * "SCHEDULED" campaign whose start date is in the past is exactly the kind
     * of inconsistency that makes seeded data look fake.
     */
    const startsAt = daysAhead(base, campaign.startsInDays);
    const endsAt = daysAhead(base, campaign.endsInDays);
    const status =
      campaign.endsInDays < 0 ? 'ENDED' : campaign.startsInDays > 0 ? 'SCHEDULED' : 'ACTIVE';

    emit(
      upsert(
        'campaigns',
        {
          id: campaignId(campaign.slug),
          title: campaign.title,
          slug: campaign.slug,
          shortDescription: campaign.shortDescription,
          description: `${campaign.shortDescription}\n\nCampaign pricing applies while the window is open and stock lasts.`,
          coverImageUrl: `/media/campaigns/${campaign.slug}.svg`,
          startsAt,
          endsAt,
          status,
          position: campaign.position,
          isVisible: 1,
          seoTitle: `${campaign.title} | Outlet`,
          seoDescription: campaign.shortDescription,
          createdAt: daysAgo(base, 60),
          updatedAt: daysAgo(base, 60),
        },
        ['slug'],
        [
          'title',
          'shortDescription',
          'description',
          'coverImageUrl',
          'startsAt',
          'endsAt',
          'status',
          'position',
        ],
      ),
    );
    bump('campaigns');

    for (const [productPosition, slug] of campaign.productSlugs.entries()) {
      const spec = productBySlug.get(slug);
      // A campaign naming a product that no longer exists would insert a row
      // pointing at nothing; skipping is better than a broken foreign key.
      if (!spec) continue;
      const campaignPriceMinor = Math.round(
        (spec.outletPriceMinor * (100 - campaign.extraDiscountPercent)) / 100,
      );
      emit(
        insert('campaign_products', {
          id: idFor('cp', `${campaign.slug}_${slug}`),
          campaignId: campaignId(campaign.slug),
          productId: productId(slug),
          campaignPriceMinor,
          maxQuantityPerOrder: 3,
          position: productPosition,
        }),
      );
      bump('campaignProducts');
    }
  }

  // --- Coupons and promotions ------------------------------------------------
  section('Coupons and promotions');
  for (const coupon of COUPONS) {
    emit(
      upsert(
        'coupons',
        {
          id: couponId(coupon.code),
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          description: coupon.description,
          minOrderMinor: coupon.minOrderMinor ?? null,
          maxDiscountMinor: coupon.maxDiscountMinor ?? null,
          maxRedemptionsPerCustomer: coupon.maxRedemptionsPerCustomer ?? null,
          firstOrderOnly: coupon.firstOrderOnly ? 1 : 0,
          freeShipping: coupon.freeShipping ? 1 : 0,
          brandIds: JSON.stringify(coupon.brandSlug ? [brandId(coupon.brandSlug)] : []),
          categoryIds: '[]',
          productIds: '[]',
          campaignIds: '[]',
          endsAt: coupon.expiresInDays === undefined ? null : daysAhead(base, coupon.expiresInDays),
          isActive: coupon.isActive === false ? 0 : 1,
          createdAt: daysAgo(base, 90),
          updatedAt: daysAgo(base, 90),
        },
        ['code'],
        [
          'type',
          'value',
          'description',
          'minOrderMinor',
          'maxDiscountMinor',
          'firstOrderOnly',
          'freeShipping',
          'brandIds',
          'endsAt',
          'isActive',
        ],
      ),
    );
    bump('coupons');
  }

  const PROMOTIONS = [
    {
      name: 'Members get early access',
      type: 'EARLY_ACCESS',
      value: 24,
      description: 'Campaign products open 24 hours early for signed-in customers.',
    },
    {
      name: 'Free returns for 30 days',
      type: 'RETURN_WINDOW',
      value: 30,
      description: 'Extended return window across the outlet.',
    },
    {
      name: 'Second item 10% off',
      type: 'BUNDLE',
      value: 10,
      description: 'Applied automatically when two items from one brand are bought together.',
    },
    {
      name: 'Winter clearance',
      type: 'SEASONAL',
      value: 40,
      description: 'Up to 40% off outerwear while stock lasts.',
    },
    {
      name: 'Newsletter welcome',
      type: 'SIGNUP',
      value: 10,
      description: 'A 10% code for new newsletter subscribers.',
    },
  ];
  for (const [index, promotion] of PROMOTIONS.entries()) {
    emit(
      insert('promotions', {
        id: idFor('promo', promotion.type),
        name: promotion.name,
        description: promotion.description,
        type: promotion.type,
        value: promotion.value,
        startsAt: daysAgo(base, 30),
        endsAt: daysAhead(base, 60),
        isActive: index === 3 ? 0 : 1,
        createdAt: daysAgo(base, 30),
        updatedAt: daysAgo(base, 30),
      }),
    );
    bump('promotions');
  }

  // --- Wishlists -------------------------------------------------------------
  section('Wishlists');
  const wishlistRandom = makeRandom(0x1157);
  for (const customer of CUSTOMERS.slice(0, 8)) {
    const handle = customer.email.split('@')[0];
    const chosen = new Set();
    while (chosen.size < 3) chosen.add(pick(wishlistRandom, PRODUCTS).slug);
    for (const slug of chosen) {
      emit(
        insert('wishlist_items', {
          id: idFor('wli', `${handle}_${slug}`),
          wishlistId: idFor('wl', handle),
          productId: productId(slug),
          createdAt: daysAgo(base, 20),
        }),
      );
      bump('wishlistItems');
    }
  }

  // --- Orders ----------------------------------------------------------------
  section('Order history');
  const orderRandom = makeRandom(0x0a5e);
  const shippingRules = {
    standardShippingMinor: SETTINGS.standardShippingMinor,
    expressShippingMinor: SETTINGS.expressShippingMinor,
    freeShippingThresholdMinor: SETTINGS.freeShippingThresholdMinor,
  };

  /** Statuses spread so every admin filter has rows behind it. */
  const ORDER_PLAN = [
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    'DELIVERED',
    'SHIPPED',
    'SHIPPED',
    'SHIPPED',
    'PACKED',
    'PACKED',
    'PROCESSING',
    'PROCESSING',
    'PROCESSING',
    'PAID',
    'PAID',
    'AWAITING_PAYMENT',
    'CANCELLED',
    'CANCELLED',
    'RETURN_REQUESTED',
    'RETURNED',
    'DELIVERED',
    'DELIVERED',
    'SHIPPED',
  ];

  const sellableProducts = PRODUCTS.filter((spec) => spec.stock !== 'sold-out');
  const orders = [];

  for (const [index, status] of ORDER_PLAN.entries()) {
    const customer = CUSTOMERS[index % CUSTOMERS.length];
    const oid = idFor('ord', `${100001 + index}`);
    const orderNumber = `OUT-${100001 + index}`;
    const placedDaysAgo = 90 - index * 3;
    const placedAt = daysAgo(base, placedDaysAgo);
    const method = index % 4 === 0 ? 'EXPRESS' : 'STANDARD';

    // 1–3 lines, each from a product with stock to give.
    const lineCount = 1 + Math.floor(orderRandom() * 3);
    const lines = [];
    const usedVariants = new Set();
    for (let i = 0; i < lineCount; i += 1) {
      const spec = pick(orderRandom, sellableProducts);
      const variants = variantsByProduct.get(spec.slug) ?? [];
      const candidates = variants.filter(
        (v) => !usedVariants.has(v.id) && (stock.get(v.id)?.onHand ?? 0) > 1,
      );
      if (candidates.length === 0) continue;
      const variant = pick(orderRandom, candidates);
      usedVariants.add(variant.id);
      const quantity = 1 + Math.floor(orderRandom() * 2);
      lines.push({ spec, variant, quantity: Math.min(quantity, stock.get(variant.id).onHand - 1) });
    }
    if (lines.length === 0) continue;

    // Totals come from the same function the live checkout uses, so a seeded
    // order and a placed one are arithmetically the same kind of thing.
    const totals = computeCartTotals({
      lines: lines.map((line) => ({
        unitPriceMinor: line.spec.outletPriceMinor,
        quantity: line.quantity,
        eligibleForCoupon: true,
      })),
      coupon: null,
      shippingRules,
      shippingMethod: method,
      taxRateBps: SETTINGS.taxRateBps,
    });

    const address = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      line1: `${STREETS[index % STREETS.length]} ${10 + index * 3}`,
      city: customer.city,
      postalCode: `${1000 + index * 137}`,
      countryCode: customer.countryCode,
    };

    const cancelled = status === 'CANCELLED';
    emit(
      insert('orders', {
        id: oid,
        orderNumber,
        userId: userId(customer.email),
        email: customer.email,
        status,
        currencyCode: CURRENCY_CODE,
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.couponDiscountMinor,
        shippingMinor: totals.shippingMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        shippingAddress: JSON.stringify(address),
        billingAddress: JSON.stringify(address),
        shippingMethod: method,
        placedAt,
        paidAt: status === 'AWAITING_PAYMENT' ? null : placedAt,
        cancelledAt: cancelled ? daysAgo(base, placedDaysAgo - 1) : null,
        cancelReason: cancelled ? 'Customer changed their mind' : null,
        createdAt: placedAt,
        updatedAt: placedAt,
      }),
    );
    bump('orders');
    orders.push({ id: oid, orderNumber, status, placedDaysAgo, totals, customer, lines, method });

    for (const [lineIndex, line] of lines.entries()) {
      const lineTotal = line.spec.outletPriceMinor * line.quantity;
      emit(
        insert('order_items', {
          id: idFor('oi', `${orderNumber}_${lineIndex}`),
          orderId: oid,
          variantId: line.variant.id,
          productSnapshot: JSON.stringify({
            productId: productId(line.spec.slug),
            slug: line.spec.slug,
            name: line.spec.name,
            brand: brandBySlug.get(line.spec.brand)?.name,
            color: line.variant.color,
            size: line.variant.size,
            imageUrl: `/media/products/${line.spec.slug}/${line.variant.color.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-front.svg`,
          }),
          sku: line.variant.sku,
          name: line.spec.name,
          quantity: line.quantity,
          unitPriceMinor: line.spec.outletPriceMinor,
          originalUnitPriceMinor: line.spec.originalPriceMinor,
          taxRateBps: SETTINGS.taxRateBps,
          taxMinor: Math.round((lineTotal * SETTINGS.taxRateBps) / (10000 + SETTINGS.taxRateBps)),
          totalMinor: lineTotal,
          returnedQuantity: status === 'RETURNED' ? line.quantity : 0,
        }),
      );
      bump('orderItems');

      /*
       * The stock this order consumed actually leaves the shelf. A cancelled
       * order gives it back, which is why it is skipped here rather than
       * subtracted and re-added.
       */
      if (!cancelled) {
        const balance = stock.get(line.variant.id);
        const previous = balance.onHand;
        balance.onHand -= line.quantity;
        balance.sold += line.quantity;
        emit(
          insert('inventory_movements', {
            id: idFor('mov', `${orderNumber}_${lineIndex}`),
            variantId: line.variant.id,
            type: 'SALE',
            quantityChange: -line.quantity,
            previousOnHand: previous,
            newOnHand: balance.onHand,
            reason: `Order ${orderNumber}`,
            orderId: oid,
            createdAt: daysAgo(base, placedDaysAgo),
          }),
        );
        if (status === 'RETURNED') {
          const beforeReturn = balance.onHand;
          balance.onHand += line.quantity;
          balance.returned += line.quantity;
          emit(
            insert('inventory_movements', {
              id: idFor('mov', `${orderNumber}_${lineIndex}_ret`),
              variantId: line.variant.id,
              type: 'RETURN_RESTOCK',
              quantityChange: line.quantity,
              previousOnHand: beforeReturn,
              newOnHand: balance.onHand,
              reason: `Return for ${orderNumber}`,
              orderId: oid,
              createdAt: daysAgo(base, Math.max(0, placedDaysAgo - 20)),
            }),
          );
        }
      }
    }

    // Status history: the path an order actually walked, not just where it is.
    const PATHS = {
      AWAITING_PAYMENT: ['AWAITING_PAYMENT'],
      PAID: ['AWAITING_PAYMENT', 'PAID'],
      PROCESSING: ['AWAITING_PAYMENT', 'PAID', 'PROCESSING'],
      PACKED: ['AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'PACKED'],
      SHIPPED: ['AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'PACKED', 'SHIPPED'],
      DELIVERED: ['AWAITING_PAYMENT', 'PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'],
      CANCELLED: ['AWAITING_PAYMENT', 'PAID', 'CANCELLED'],
      RETURN_REQUESTED: [
        'AWAITING_PAYMENT',
        'PAID',
        'PROCESSING',
        'PACKED',
        'SHIPPED',
        'DELIVERED',
        'RETURN_REQUESTED',
      ],
      RETURNED: [
        'AWAITING_PAYMENT',
        'PAID',
        'PROCESSING',
        'PACKED',
        'SHIPPED',
        'DELIVERED',
        'RETURN_REQUESTED',
        'RETURNED',
      ],
    };
    const path = PATHS[status] ?? ['AWAITING_PAYMENT'];
    for (const [step, toStatus] of path.entries()) {
      emit(
        insert('order_status_history', {
          id: idFor('osh', `${orderNumber}_${step}`),
          orderId: oid,
          fromStatus: step === 0 ? null : path[step - 1],
          toStatus,
          note: step === 0 ? 'Order placed' : null,
          createdAt: daysAgo(base, Math.max(0, placedDaysAgo - step)),
        }),
      );
    }

    // Payment. The provider is always the demo one; no real processor exists.
    const paymentStatus =
      status === 'AWAITING_PAYMENT'
        ? 'PENDING'
        : cancelled
          ? 'CANCELLED'
          : status === 'RETURNED'
            ? 'REFUNDED'
            : 'PAID';
    const pid = idFor('pay', orderNumber);
    emit(
      insert('payments', {
        id: pid,
        orderId: oid,
        provider: 'demo',
        providerPaymentId: `DEMO-PAY-${100001 + index}`,
        idempotencyKey: `seed-${orderNumber}`,
        status: paymentStatus,
        amountMinor: totals.totalMinor,
        refundedAmountMinor: status === 'RETURNED' ? totals.totalMinor : 0,
        currencyCode: CURRENCY_CODE,
        createdAt: placedAt,
        updatedAt: placedAt,
      }),
    );
    emit(
      insert('payment_events', {
        id: idFor('pev', orderNumber),
        paymentId: pid,
        provider: 'demo',
        providerEventId: `DEMO-EVT-${100001 + index}`,
        type:
          paymentStatus === 'PAID' ? 'payment.succeeded' : `payment.${paymentStatus.toLowerCase()}`,
        payload: JSON.stringify({ orderNumber, amountMinor: totals.totalMinor, demo: true }),
        processedAt: placedAt,
        createdAt: placedAt,
      }),
    );

    // Shipment, for anything that got that far.
    if (['SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'RETURNED'].includes(status)) {
      const sid = idFor('shp', orderNumber);
      const delivered = status !== 'SHIPPED';
      emit(
        insert('shipments', {
          id: sid,
          orderId: oid,
          carrier: 'Demo Post',
          trackingNumber: `SIM-GEO-${100001 + index}`,
          status: delivered ? 'DELIVERED' : 'SHIPPED',
          shippedAt: daysAgo(base, Math.max(0, placedDaysAgo - 2)),
          deliveredAt: delivered ? daysAgo(base, Math.max(0, placedDaysAgo - 4)) : null,
          createdAt: daysAgo(base, Math.max(0, placedDaysAgo - 2)),
          updatedAt: daysAgo(base, Math.max(0, placedDaysAgo - 2)),
        }),
      );
      const scans = [
        ['ACCEPTED', 'Parcel accepted at depot', 2],
        ['IN_TRANSIT', 'In transit', 3],
        ...(delivered ? [['DELIVERED', 'Delivered', 4]] : []),
      ];
      for (const [code, label, offset] of scans) {
        emit(
          insert('shipment_events', {
            id: idFor('sev', `${orderNumber}_${code}`),
            shipmentId: sid,
            code,
            label,
            location: customer.city,
            occurredAt: daysAgo(base, Math.max(0, placedDaysAgo - offset)),
          }),
        );
      }
    }

    // Notification, so the customer's inbox is not empty either.
    if (status !== 'AWAITING_PAYMENT') {
      const readable = status.toLowerCase().replace(/_/g, ' ');
      const itemCount = `${lines.length} item${lines.length === 1 ? '' : 's'}`;
      emit(
        insert('notifications', {
          id: idFor('ntf', orderNumber),
          userId: userId(customer.email),
          orderId: oid,
          type: 'ORDER_STATUS',
          title: `Order ${orderNumber} is ${readable}`,
          body: `Your order ${orderNumber} (${itemCount}) is now ${readable}.`,
          readAt: index % 3 === 0 ? daysAgo(base, Math.max(0, placedDaysAgo - 5)) : null,
          createdAt: daysAgo(base, Math.max(0, placedDaysAgo - 1)),
        }),
      );
      bump('notifications');

      /*
       * The message a real deployment would have emailed. Seeded alongside the
       * notification so /account/inbox has history on a fresh database rather
       * than being an empty screen a reviewer has to place an order to fill.
       * Nothing is sent anywhere — see migrations/0002_inbox.sql.
       */
      emit(
        insert('simulated_emails', {
          id: idFor('eml', orderNumber),
          userId: userId(customer.email),
          orderId: oid,
          to: customer.email,
          subject: `Your order ${orderNumber} is ${readable}`,
          body: `Hello ${customer.firstName}, your order ${orderNumber} (${itemCount}) is now ${readable}. No real payment was taken and no real email was sent — this is a demo environment.`,
          template: 'order_status',
          readAt: index % 3 === 0 ? daysAgo(base, Math.max(0, placedDaysAgo - 5)) : null,
          sentAt: daysAgo(base, Math.max(0, placedDaysAgo - 1)),
        }),
      );
      bump('simulated_emails');
    }
  }

  // --- Returns and refunds ---------------------------------------------------
  section('Returns and refunds');
  for (const order of orders.filter(
    (o) => o.status === 'RETURN_REQUESTED' || o.status === 'RETURNED',
  )) {
    const completed = order.status === 'RETURNED';
    const rid = idFor('rma', order.orderNumber);
    emit(
      insert('return_requests', {
        id: rid,
        rmaNumber: `RMA-${order.orderNumber.slice(4)}`,
        orderId: order.id,
        userId: userId(order.customer.email),
        status: completed ? 'COMPLETED' : 'REQUESTED',
        reason: completed ? 'Wrong size' : 'Not as described',
        customerNote: completed
          ? 'Too small, would like to return.'
          : 'The colour is darker than the photos.',
        createdAt: daysAgo(base, Math.max(0, order.placedDaysAgo - 20)),
        updatedAt: daysAgo(base, Math.max(0, order.placedDaysAgo - 18)),
      }),
    );
    bump('returns');

    for (const [lineIndex, line] of order.lines.entries()) {
      emit(
        insert('return_items', {
          id: idFor('rmi', `${order.orderNumber}_${lineIndex}`),
          returnRequestId: rid,
          orderItemId: idFor('oi', `${order.orderNumber}_${lineIndex}`),
          quantity: line.quantity,
          receivedQuantity: completed ? line.quantity : 0,
          restockedQuantity: completed ? line.quantity : 0,
          condition: completed ? 'RESELLABLE' : 'UNINSPECTED',
        }),
      );
    }

    if (completed) {
      emit(
        insert('refunds', {
          id: idFor('ref', order.orderNumber),
          orderId: order.id,
          paymentId: idFor('pay', order.orderNumber),
          returnRequestId: rid,
          amountMinor: order.totals.totalMinor,
          status: 'SUCCEEDED',
          providerRefundId: `SIM-REF-${order.orderNumber.slice(4)}`,
          reason: 'Return completed',
          createdAt: daysAgo(base, Math.max(0, order.placedDaysAgo - 17)),
          updatedAt: daysAgo(base, Math.max(0, order.placedDaysAgo - 17)),
        }),
      );
      bump('refunds');
    }
  }

  // --- Inventory balances ----------------------------------------------------
  // Emitted last because the order history above is what decided them.
  section('Inventory balances');
  for (const [vid, balance] of stock.entries()) {
    emit(
      upsert(
        'inventory_balances',
        {
          id: idFor('inv', vid),
          variantId: vid,
          onHandQuantity: balance.onHand,
          reservedQuantity: 0,
          soldQuantity: balance.sold,
          damagedQuantity: balance.damaged,
          returnedQuantity: balance.returned,
          updatedAt: iso(base),
        },
        ['variantId'],
        ['onHandQuantity', 'soldQuantity', 'returnedQuantity', 'updatedAt'],
      ),
    );
    bump('inventoryBalances');
  }

  // Opening-stock movements, so the inventory ledger starts from something.
  for (const [vid, balance] of stock.entries()) {
    const opening = balance.onHand + balance.sold - balance.returned;
    if (opening <= 0) continue;
    emit(
      insert('inventory_movements', {
        id: idFor('mov', `${vid}_initial`),
        variantId: vid,
        type: 'INITIAL',
        quantityChange: opening,
        previousOnHand: 0,
        newOnHand: opening,
        reason: 'Opening stock',
        createdAt: CATALOG_EPOCH,
      }),
    );
  }

  // --- Content, settings, audit ----------------------------------------------
  section('CMS pages');
  for (const page of CONTENT_PAGES) {
    emit(
      upsert(
        'content_pages',
        { key: page.key, title: page.title, body: page.body, updatedAt: iso(base) },
        ['key'],
        ['title', 'body', 'updatedAt'],
      ),
    );
    bump('contentPages');
  }

  section('Site settings');
  const settingsRows = {
    ...SETTINGS,
    currencyCode: CURRENCY_CODE,
    storeName: 'Outlet Marketplace',
    supportEmail: 'support@demo.local',
    demoMode: true,
    heroHeadline: 'Outlet prices on the brands you already wear',
    heroSubheadline:
      'Limited quantities, released in short campaigns. When it is gone, it is gone.',
    heroCtaLabel: 'Shop the outlet',
    heroCtaHref: '/shop',
  };
  for (const [key, value] of Object.entries(settingsRows)) {
    emit(
      upsert(
        'site_settings',
        { key, value: JSON.stringify(value), updatedAt: iso(base) },
        ['key'],
        ['value', 'updatedAt'],
      ),
    );
    bump('settings');
  }

  section('Newsletter subscriptions');
  for (const [index, customer] of CUSTOMERS.entries()) {
    if (index % 3 !== 0) continue;
    emit(
      insert('newsletter_subscriptions', {
        id: idFor('nws', customer.email.split('@')[0]),
        email: customer.email,
        subscribedAt: daysAgo(base, 100 - index),
        source: 'footer',
      }),
    );
  }

  section('Audit log');
  const AUDIT = [
    [
      'product.update',
      'Product',
      productId(PRODUCTS[0].slug),
      'catalog@demo.local',
      'Corrected the outlet price',
    ],
    [
      'inventory.adjust',
      'InventoryBalance',
      null,
      'inventory@demo.local',
      'Cycle count adjustment',
    ],
    [
      'order.status_change',
      'Order',
      orders[0]?.id ?? null,
      'orders@demo.local',
      'Marked as packed',
    ],
    ['coupon.create', 'Coupon', couponId('SALE15'), 'marketing@demo.local', 'Spring campaign code'],
    ['review.moderate', 'ProductReview', null, 'moderator@demo.local', 'Removed a reported review'],
    [
      'campaign.publish',
      'Campaign',
      campaignId(CAMPAIGNS[0].slug),
      'marketing@demo.local',
      'Published campaign',
    ],
    ['content.update', 'ContentPage', 'shipping', 'marketing@demo.local', 'Updated delivery times'],
    [
      'settings.update',
      'SiteSetting',
      'freeShippingThresholdMinor',
      'admin@demo.local',
      'Raised the free-shipping threshold',
    ],
    [
      'user.role_change',
      'User',
      userId('support@demo.local'),
      'admin@demo.local',
      'Granted Customer Support',
    ],
    [
      'customer.support_note',
      'User',
      userId('customer@demo.local'),
      'support@demo.local',
      'Logged a delivery query',
    ],
  ];
  for (const [index, [action, entityType, entityId, actorEmail, reason]] of AUDIT.entries()) {
    emit(
      insert('audit_logs', {
        id: idFor('aud', `${action}_${index}`),
        actorUserId: userId(actorEmail),
        actorEmail,
        actorType: 'ADMIN',
        action,
        entityType,
        entityId,
        reason,
        createdAt: daysAgo(base, 30 - index * 2),
      }),
    );
    bump('auditLogs');
  }

  section('Customer support notes');
  emit(
    insert('customer_support_notes', {
      id: idFor('csn', 'customer_1'),
      userId: userId('customer@demo.local'),
      authorId: userId('support@demo.local'),
      note: 'Asked about delivery to a pickup point. Explained the standard options; no action needed.',
      createdAt: daysAgo(base, 12),
    }),
  );

  return { statements, counts };
}
