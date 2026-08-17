/**
 * The admin panel's four downloads: two CSV exports and two printable documents.
 *
 * These are the panel's only plain `<a href>` links — every other call goes
 * through its fetch client. That is why they went missing for so long: an audit
 * of `api.get(...)` call sites does not see them, and all four landed on the
 * Worker's `notFound` handler, so Products → Export CSV, Inventory → Export CSV,
 * Invoice and Packing slip each navigated the operator's tab to
 * `{"code":"NOT_FOUND","message":"No such endpoint."}`.
 *
 * They exist in the NestJS stack, and the formats here are ported from it
 * verbatim so a file exported from either backend imports into either backend.
 *
 * A note on the links working at all: the session cookie is `SameSite=None;
 * Secure` outside development (see auth/session.ts), so a top-level navigation
 * from the panel's origin to this one does carry it. Nothing extra is needed for
 * a download to be authenticated — but it does mean these must check permissions
 * exactly as carefully as the JSON routes do.
 */

import type { Context } from 'hono';
import { Permissions } from '@outlet/types';
import type { AppEnv } from '../http/context';
import { ctxOf } from '../http/context';
import { admin } from './admin';
import { notFound } from '../lib/errors';
import { csvFile, csvHeaders, csvRow } from '../lib/csv';
import { parseJson } from '../lib/sql';
import { pathId } from '../lib/validate';
import { requirePermission } from '../auth/rbac';

/*
 * Registered as literal paths, which is safe here and is not always: Hono
 * resolves `/products/export/csv` by arity first, and no other three-segment GET
 * under `/products` exists. Contrast `/categories/reorder`, which has the same
 * shape as `/categories/:id` and therefore has to be dispatched from inside it.
 */

// --- Products ----------------------------------------------------------------

const PRODUCT_CSV_HEADER =
  'productSlug,productName,brandSlug,categorySlug,status,originalPriceMinor,' +
  'outletPriceMinor,sku,size,color,onHandQuantity,reservedQuantity,isEnabled';

admin.get('/products/export/csv', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.ProductsView);

  const rows = await ctx.db.all<{
    productSlug: string;
    productName: string;
    brandSlug: string;
    categorySlug: string | null;
    status: string;
    originalPriceMinor: number;
    outletPriceMinor: number;
    sku: string;
    size: string | null;
    color: string | null;
    onHandQuantity: number;
    reservedQuantity: number;
    isEnabled: number;
  }>(
    `SELECT p."slug" AS "productSlug", p."name" AS "productName", b."slug" AS "brandSlug",
            c."slug" AS "categorySlug", p."status", p."originalPriceMinor", p."outletPriceMinor",
            v."sku", v."size", v."color",
            COALESCE(i."onHandQuantity", 0) AS "onHandQuantity",
            COALESCE(i."reservedQuantity", 0) AS "reservedQuantity",
            v."isEnabled"
       FROM "product_variants" v
       JOIN "products" p ON p."id" = v."productId"
       JOIN "brands" b ON b."id" = p."brandId"
       LEFT JOIN "categories" c ON c."id" = p."categoryId"
       LEFT JOIN "inventory_balances" i ON i."variantId" = v."id"
      ORDER BY p."name", v."position"`,
  );

  return new Response(
    csvFile(
      PRODUCT_CSV_HEADER,
      rows.map((row) =>
        csvRow([
          row.productSlug,
          row.productName,
          row.brandSlug,
          row.categorySlug ?? '',
          row.status,
          row.originalPriceMinor,
          row.outletPriceMinor,
          row.sku,
          row.size ?? '',
          row.color ?? '',
          row.onHandQuantity,
          row.reservedQuantity,
          // `true`/`false` rather than 1/0: the column reads as a flag in a
          // spreadsheet, and the NestJS export writes a boolean here.
          row.isEnabled === 1 ? 'true' : 'false',
        ]),
      ),
    ),
    { headers: csvHeaders('products.csv') },
  );
});

// --- Inventory ---------------------------------------------------------------

const INVENTORY_CSV_HEADER =
  'sku,productSlug,onHandQuantity,reservedQuantity,availableQuantity,' +
  'soldQuantity,damagedQuantity,returnedQuantity';

admin.get('/inventory/export/csv', async (c) => {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.InventoryView);

  const rows = await ctx.db.all<{
    sku: string;
    productSlug: string;
    onHandQuantity: number;
    reservedQuantity: number;
    soldQuantity: number;
    damagedQuantity: number;
    returnedQuantity: number;
  }>(
    `SELECT v."sku", p."slug" AS "productSlug",
            COALESCE(i."onHandQuantity", 0) AS "onHandQuantity",
            COALESCE(i."reservedQuantity", 0) AS "reservedQuantity",
            COALESCE(i."soldQuantity", 0) AS "soldQuantity",
            COALESCE(i."damagedQuantity", 0) AS "damagedQuantity",
            COALESCE(i."returnedQuantity", 0) AS "returnedQuantity"
       FROM "product_variants" v
       JOIN "products" p ON p."id" = v."productId"
       LEFT JOIN "inventory_balances" i ON i."variantId" = v."id"
      ORDER BY v."sku"`,
  );

  return new Response(
    csvFile(
      INVENTORY_CSV_HEADER,
      rows.map((row) =>
        csvRow([
          row.sku,
          row.productSlug,
          row.onHandQuantity,
          row.reservedQuantity,
          Math.max(0, row.onHandQuantity - row.reservedQuantity),
          row.soldQuantity,
          row.damagedQuantity,
          row.returnedQuantity,
        ]),
      ),
    ),
    { headers: csvHeaders('inventory.csv') },
  );
});

// --- Printable documents -----------------------------------------------------

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Minor units as money, without pulling in an i18n dependency for two pages. */
const money = (minor: number, currency: string): string =>
  `${(minor / 100).toFixed(2)} ${currency}`;

interface DocumentAddress {
  firstName?: string;
  lastName?: string;
  line1?: string;
  line2?: string;
  postalCode?: string;
  city?: string;
  countryCode?: string;
}

/**
 * The invoice and the packing slip, which are one document with prices and one
 * without: a warehouse picking an order should not be handed the customer's
 * financials, and an invoice without them would be pointless.
 *
 * No script of any kind, deliberately. The NestJS version auto-prints via
 * `<body onload="window.print()">` and carries a Print button; both are inline
 * script, which this API's Content-Security-Policy forbids on every response.
 * Shipping them here would have produced a dead button rather than a
 * convenience, so the document is plain printable HTML and the operator uses the
 * browser's own print command. The `@media print` rules make that come out right.
 */
async function printableDocument(
  c: Context<AppEnv>,
  title: 'INVOICE' | 'PACKING SLIP',
): Promise<Response> {
  const ctx = ctxOf(c);
  requirePermission(ctx.session, Permissions.OrdersView);
  const id = pathId(c.req.param('id'));

  const order = await ctx.db.first<{
    orderNumber: string;
    email: string;
    status: string;
    currencyCode: string;
    subtotalMinor: number;
    discountMinor: number;
    shippingMinor: number;
    taxMinor: number;
    totalMinor: number;
    shippingAddress: string;
    shippingMethod: string;
    placedAt: string;
  }>(
    `SELECT "orderNumber", "email", "status", "currencyCode", "subtotalMinor", "discountMinor",
            "shippingMinor", "taxMinor", "totalMinor", "shippingAddress", "shippingMethod",
            "placedAt"
       FROM "orders" WHERE "id" = ?`,
    id,
  );
  if (!order) throw notFound('Order not found.');

  const items = await ctx.db.all<{
    sku: string;
    name: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
  }>(
    `SELECT "sku", "name", "quantity", "unitPriceMinor", "totalMinor"
       FROM "order_items" WHERE "orderId" = ? ORDER BY "name"`,
    id,
  );

  const address = parseJson<DocumentAddress>(order.shippingAddress, {});
  const withPrices = title === 'INVOICE';
  const currency = order.currencyCode;

  const rows = items
    .map(
      (item) => `<tr>
      <td class="sku">${escapeHtml(item.sku)}</td>
      <td>${escapeHtml(item.name)}</td>
      <td class="qty">${item.quantity}</td>
      ${
        withPrices
          ? `<td class="num">${money(item.unitPriceMinor, currency)}</td>
             <td class="num">${money(item.totalMinor, currency)}</td>`
          : ''
      }
    </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} ${escapeHtml(order.orderNumber)}</title>
<style>
  :root { color-scheme: light }
  body { font-family: system-ui, -apple-system, Segoe UI, Arial, sans-serif; margin: 40px;
         color: #111; background: #fff; font-size: 14px; line-height: 1.5 }
  header { display: flex; justify-content: space-between; align-items: baseline;
           border-bottom: 2px solid #111; padding-bottom: 12px }
  .brand { font-weight: 900; letter-spacing: -0.02em }
  .brand span { color: #dc2626 }
  h1 { font-size: 18px; margin: 0; text-transform: uppercase; letter-spacing: 0.06em }
  .meta { display: flex; gap: 48px; margin: 24px 0 }
  .meta h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
             color: #6b7280; margin: 0 0 4px }
  table { width: 100%; border-collapse: collapse; margin-top: 8px }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280 }
  .sku { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #6b7280 }
  .qty { text-align: center }
  .num, th.num { text-align: right; font-variant-numeric: tabular-nums }
  .totals { margin-left: auto; margin-top: 16px; width: 260px }
  .totals td { border: 0; padding: 3px 0 }
  .totals .grand td { border-top: 2px solid #111; font-weight: 700; padding-top: 8px }
  footer { margin-top: 48px; color: #6b7280; font-size: 11px;
           border-top: 1px solid #e5e7eb; padding-top: 12px }
  @media print { body { margin: 0 } header { border-color: #000 } }
</style>
</head>
<body>
<header>
  <p class="brand">OUTLET<span>.</span></p>
  <h1>${title} — ${escapeHtml(order.orderNumber)}</h1>
</header>

<div class="meta">
  <div>
    <h2>Order</h2>
    ${escapeHtml(order.orderNumber)}<br>
    ${escapeHtml(order.placedAt.slice(0, 10))}<br>
    ${escapeHtml(order.status)} · ${escapeHtml(order.shippingMethod)}
  </div>
  <div>
    <h2>Ship to</h2>
    ${escapeHtml(`${address.firstName ?? ''} ${address.lastName ?? ''}`.trim())}<br>
    ${escapeHtml(address.line1 ?? '')}${address.line2 ? `<br>${escapeHtml(address.line2)}` : ''}<br>
    ${escapeHtml(address.postalCode ?? '')} ${escapeHtml(address.city ?? '')}<br>
    ${escapeHtml(address.countryCode ?? '')}
  </div>
  <div>
    <h2>Contact</h2>
    ${escapeHtml(order.email)}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>SKU</th>
      <th>Item</th>
      <th class="qty">Qty</th>
      ${withPrices ? '<th class="num">Unit</th><th class="num">Total</th>' : ''}
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

${
  withPrices
    ? `<table class="totals">
  <tr><td>Subtotal</td><td class="num">${money(order.subtotalMinor, currency)}</td></tr>
  <tr><td>Discount</td><td class="num">-${money(order.discountMinor, currency)}</td></tr>
  <tr><td>Shipping</td><td class="num">${money(order.shippingMinor, currency)}</td></tr>
  <tr><td>Included VAT</td><td class="num">${money(order.taxMinor, currency)}</td></tr>
  <tr class="grand"><td>Total</td><td class="num">${money(order.totalMinor, currency)}</td></tr>
</table>`
    : '<p>No prices are shown on a packing slip.</p>'
}

<footer>
  Outlet Marketplace — demonstration document. No payment was taken and this is not a
  valid tax invoice.
</footer>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

admin.get('/orders/:id/invoice', (c) => printableDocument(c, 'INVOICE'));
admin.get('/orders/:id/packing-slip', (c) => printableDocument(c, 'PACKING SLIP'));
