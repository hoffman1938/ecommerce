/**
 * Maps the real API's public routes onto the demo data layer.
 *
 * Both the browser client (lib/api.ts) and the build-time server helper
 * (lib/server-api.ts) dispatch through here when demo mode is on, so a single
 * definition covers server-rendered and client-fetched data alike.
 *
 * Endpoints that genuinely require the backend (auth, checkout, orders,
 * returns) fail with the same status codes the real API would use, so the
 * existing UI error paths render instead of the page breaking.
 */

import { DemoApiError } from './cart';
import * as cart from './cart';
import {
  getCampaign,
  getContentPage,
  getProduct,
  listBrands,
  listCampaigns,
  listCategories,
  listProducts,
  type ListProductsParams,
} from './queries';

export { DemoApiError };

const NEEDS_BACKEND =
  'This is a static demo deployed on Cloudflare Pages. Accounts, checkout and orders need the NestJS API, PostgreSQL and Redis, which Pages cannot host.';

function parse(path: string): { segments: string[]; query: URLSearchParams } {
  const [rawPath, rawQuery = ''] = path.split('?');
  return {
    segments: rawPath.split('/').filter(Boolean),
    query: new URLSearchParams(rawQuery),
  };
}

function queryToParams(query: URLSearchParams): ListProductsParams {
  const params: Record<string, string> = {};
  for (const [key, value] of query.entries()) {
    if (value) params[key] = value;
  }
  return params as ListProductsParams;
}

/**
 * Resolve an API path against the demo data.
 * Throws DemoApiError for anything the demo cannot serve.
 */
export function demoRequest(method: string, path: string, body?: unknown): unknown {
  const { segments, query } = parse(path);
  const verb = method.toUpperCase();
  const [head, ...rest] = segments;

  switch (head) {
    case 'campaigns': {
      if (verb !== 'GET') break;
      if (rest.length === 0) return listCampaigns(query.get('status') ?? undefined);
      const campaign = getCampaign(rest[0]);
      if (!campaign) throw new DemoApiError(404, 'Campaign not found.');
      return campaign;
    }

    case 'catalog': {
      if (verb !== 'GET') break;
      if (rest[0] === 'brands') return listBrands();
      if (rest[0] === 'categories') return listCategories();
      if (rest[0] === 'products') {
        if (rest.length === 1) return listProducts(queryToParams(query));
        const product = getProduct(rest[1]);
        if (!product) throw new DemoApiError(404, 'Product not found.');
        return product;
      }
      break;
    }

    case 'content': {
      if (verb !== 'GET') break;
      if (rest[0] === 'pages' && rest[1]) {
        const page = getContentPage(rest[1]);
        if (!page) throw new DemoApiError(404, 'Page not found.');
        return page;
      }
      break;
    }

    case 'cart': {
      if (rest.length === 0) {
        if (verb === 'GET') return cart.getCart();
        if (verb === 'DELETE') return cart.clearCart();
        break;
      }
      if (rest[0] === 'items') {
        if (verb === 'POST' && rest.length === 1) {
          return cart.addItem(body as { variantId: string; quantity: number; campaignId?: string | null });
        }
        if ((verb === 'PATCH' || verb === 'PUT') && rest[1]) {
          return cart.updateItem(rest[1], Number((body as { quantity: number }).quantity));
        }
        if (verb === 'DELETE' && rest[1]) return cart.removeItem(rest[1]);
      }
      if (rest[0] === 'coupon') {
        if (verb === 'POST') return cart.applyCoupon((body as { code: string }).code);
        if (verb === 'DELETE') return cart.applyCoupon(null);
      }
      break;
    }

    case 'auth': {
      // No sessions in the demo: report a signed-out visitor so the header and
      // guarded pages render their anonymous state rather than erroring.
      if (rest[0] === 'me' && verb === 'GET') return { user: null };
      if (rest[0] === 'logout' && verb === 'POST') return {};
      throw new DemoApiError(501, NEEDS_BACKEND);
    }

    case 'account':
      throw new DemoApiError(401, NEEDS_BACKEND);

    case 'checkout':
    case 'orders':
    case 'returns':
      throw new DemoApiError(501, NEEDS_BACKEND);

    default:
      break;
  }

  throw new DemoApiError(404, `No demo handler for ${verb} ${path}`);
}
