/**
 * Maps the real API's routes onto the demo layer.
 *
 * Both the browser client (lib/api.ts) and the build-time server helper
 * (lib/server-api.ts) dispatch through here when demo mode is on, so one
 * definition covers server-rendered and client-fetched data alike.
 *
 * Anything unhandled throws a 404 rather than falling through silently, so a
 * missed endpoint surfaces as a visible error instead of an empty screen.
 */

import * as account from './account';
import * as auth from './auth';
import * as cart from './cart';
import * as orders from './orders';
import { DemoApiError } from './store';
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

/* eslint-disable complexity */
export function demoRequest(method: string, path: string, body?: unknown): unknown {
  const { segments, query } = parse(path);
  const verb = method.toUpperCase();
  const [head, ...rest] = segments;
  // Handlers validate their own input, so the untyped body is passed through.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = (body ?? {}) as any;

  switch (head) {
    // --- Catalog -----------------------------------------------------------
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
      if (verb === 'GET' && rest[0] === 'pages' && rest[1]) {
        const page = getContentPage(rest[1]);
        if (!page) throw new DemoApiError(404, 'Page not found.');
        return page;
      }
      break;
    }

    // --- Cart --------------------------------------------------------------
    case 'cart': {
      if (rest.length === 0) {
        if (verb === 'GET') return cart.getCart();
        if (verb === 'DELETE') return cart.clearCart();
        break;
      }
      if (rest[0] === 'items') {
        if (verb === 'POST' && rest.length === 1) return cart.addItem(payload);
        if ((verb === 'PATCH' || verb === 'PUT') && rest[1]) {
          return cart.updateItem(rest[1], Number((payload as { quantity: number }).quantity));
        }
        if (verb === 'DELETE' && rest[1]) return cart.removeItem(rest[1]);
      }
      if (rest[0] === 'coupon') {
        if (verb === 'POST') return cart.applyCoupon((payload as { code: string }).code);
        if (verb === 'DELETE') return cart.applyCoupon(null);
      }
      break;
    }

    // --- Auth --------------------------------------------------------------
    case 'auth': {
      if (rest[0] === 'me' && verb === 'GET') return auth.me();
      if (verb !== 'POST') break;
      switch (rest[0]) {
        case 'register':
          return auth.register(payload);
        case 'login':
          return auth.login(payload);
        case 'logout':
          return auth.logout();
        case 'change-password':
          return auth.changePassword(payload);
        case 'forgot-password':
          return auth.forgotPassword(payload);
        case 'reset-password':
          return auth.resetPassword(payload);
        case 'verify-email':
          return auth.verifyEmail(payload);
        default:
          break;
      }
      break;
    }

    // --- Account -----------------------------------------------------------
    case 'account': {
      if (rest[0] === 'profile') {
        if (verb === 'GET') return account.getProfile();
        if (verb === 'PATCH' || verb === 'PUT') return account.updateProfile(payload);
      }
      if (rest[0] === 'notification-preferences' && (verb === 'PATCH' || verb === 'PUT')) {
        return account.updateNotificationPreferences(payload);
      }
      if (rest[0] === 'addresses') {
        if (verb === 'GET' && rest.length === 1) return account.listAddresses();
        if (verb === 'POST' && rest.length === 1) return account.createAddress(payload);
        if (verb === 'DELETE' && rest[1]) return account.deleteAddress(rest[1]);
      }
      if (rest[0] === 'wishlist') {
        if (verb === 'GET' && rest.length === 1) return account.listWishlist();
        if (verb === 'POST' && rest.length === 1) return account.addToWishlist(payload);
        if (verb === 'DELETE' && rest[1]) return account.removeFromWishlist(rest[1]);
      }
      if (rest[0] === 'orders') {
        if (verb === 'GET' && rest.length === 1) return orders.listOrders();
        if (verb === 'GET' && rest[1]) return orders.orderById(rest[1]);
      }
      if (rest[0] === 'returns') {
        if (verb === 'GET' && rest.length === 1) return account.listReturns();
        if (verb === 'POST' && rest.length === 1) return account.createReturn(payload);
      }
      break;
    }

    // --- Checkout and payments ---------------------------------------------
    case 'checkout': {
      if (verb !== 'POST') break;
      if (rest[0] === 'start') return orders.startCheckout();
      if (rest[0] === 'submit') return orders.submitCheckout(payload);
      break;
    }

    case 'payments': {
      if (rest[0] === 'mock' && rest[1] && rest[2] === 'simulate' && verb === 'POST') {
        return orders.simulatePayment(rest[1], payload);
      }
      if (rest[1] === 'status' && verb === 'GET') return orders.paymentStatus(rest[0]);
      break;
    }

    case 'newsletter': {
      if (rest[0] === 'subscribe' && verb === 'POST') return auth.subscribeNewsletter(payload);
      break;
    }

    default:
      break;
  }

  throw new DemoApiError(404, `No demo handler for ${verb} ${path}`);
}
/* eslint-enable complexity */
