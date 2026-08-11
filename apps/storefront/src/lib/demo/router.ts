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

import type { TargetGroup } from '@outlet/types';
import * as account from './account';
import * as auth from './auth';
import * as cart from './cart';
import * as inbox from './inbox';
import * as orders from './orders';
import * as simulation from './simulation';
import { DemoApiError } from './store';
import {
  getCampaign,
  getContentPage,
  getProduct,
  getProductReviews,
  listBrands,
  listCampaigns,
  listCategories,
  listProducts,
  recommendedProducts,
  relatedProducts,
  resolveCategoryPath,
  searchSuggestions,
  type ListProductsParams,
} from './queries';

export { DemoApiError };

/** Comma-separated slug lists used by the recommendation endpoint. */
function splitSlugs(value: string | null): string[] {
  if (!value) return [];
  return value.split(',').filter(Boolean).slice(0, 20);
}

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
      if (rest[0] === 'categories') {
        if (rest[1] === 'path') {
          const segments = (query.get('path') ?? '')
            .split('/')
            .map((segment) => segment.trim())
            .filter(Boolean)
            .slice(0, 3);
          const trail = resolveCategoryPath(segments);
          if (!trail) throw new DemoApiError(404, 'Category not found.');
          return trail;
        }
        return listCategories();
      }
      if (rest[0] === 'suggest') return searchSuggestions(query.get('q') ?? '');
      if (rest[0] === 'recommended') {
        return recommendedProducts(
          {
            recentSlugs: splitSlugs(query.get('recent')),
            wishlistSlugs: splitSlugs(query.get('wishlist')),
            cartSlugs: splitSlugs(query.get('cart')),
            audience: (query.get('audience') as TargetGroup | null) ?? undefined,
          },
          Number(query.get('limit')) || 4,
        );
      }
      if (rest[0] === 'products') {
        if (rest.length === 1) return listProducts(queryToParams(query));
        if (rest[2] === 'reviews') {
          const reviews = getProductReviews(rest[1], {
            sort: query.get('sort') ?? undefined,
            page: query.get('page') ?? undefined,
            pageSize: query.get('pageSize') ?? undefined,
          });
          if (!reviews) throw new DemoApiError(404, 'Product not found.');
          return reviews;
        }
        if (rest[2] === 'related') {
          return relatedProducts(rest[1], Number(query.get('limit')) || 4);
        }
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

    /**
     * QA simulation controls. Demo-only by design: these have no counterpart in
     * the real API, and a request to /simulation against it would 404.
     */
    case 'simulation': {
      if (rest[0] === 'status' && verb === 'GET') return simulation.simulationStatus();
      if (rest[0] === 'events' && verb === 'GET') {
        return inbox.listEvents(Number(query.get('limit')) || 100);
      }
      if (rest[0] === 'returns' && verb === 'GET') return simulation.listReturnsForQa();
      if (rest[0] === 'inventory') {
        if (verb === 'GET') return simulation.listInventory(query.get('slug') ?? undefined);
        if (verb === 'POST') {
          return simulation.setStock(payload.variantId, Number(payload.available));
        }
      }
      if (verb !== 'POST') break;
      switch (rest[0]) {
        case 'travel':
          return simulation.travel(String(payload.amount));
        case 'reset-time':
          return simulation.resetTime();
        case 'advance-order':
          return simulation.advanceOrder(String(payload.order));
        case 'set-order-stage':
          return simulation.setOrderStage(String(payload.order), String(payload.stage));
        case 'fail-delivery':
          return simulation.failDelivery(String(payload.order));
        case 'cancel-order':
          return simulation.qaCancelOrder(String(payload.order));
        case 'advance-return':
          return simulation.advanceReturn(String(payload.rma));
        case 'reject-return':
          return simulation.rejectReturn(String(payload.rma));
        case 'reset':
          return simulation.resetSimulation(payload.target ?? 'all');
        default:
          break;
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
        if (verb === 'POST' && rest[2] === 'save') return cart.saveForLater(rest[1]);
        if ((verb === 'PATCH' || verb === 'PUT') && rest[1]) {
          return cart.updateItem(rest[1], Number((payload as { quantity: number }).quantity));
        }
        if (verb === 'DELETE' && rest[1]) return cart.removeItem(rest[1]);
      }
      if (rest[0] === 'saved' && rest[1]) {
        if (verb === 'POST' && rest[2] === 'restore') return cart.moveToCart(rest[1]);
        if (verb === 'DELETE') return cart.removeSaved(rest[1]);
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
        if (verb === 'POST' && rest[2] === 'cancel') {
          return orders.cancelOrder(rest[1], payload?.reason);
        }
        if (verb === 'GET' && rest[1]) return orders.orderById(rest[1]);
      }
      if (rest[0] === 'returns') {
        if (verb === 'GET' && rest.length === 1) return account.listReturns();
        if (verb === 'POST' && rest.length === 1) return account.createReturn(payload);
      }
      if (rest[0] === 'notifications') {
        if (verb === 'GET' && rest.length === 1) return inbox.listNotifications();
        if (verb === 'POST' && rest[1] === 'read-all') return inbox.markAllNotificationsRead();
        if (verb === 'POST' && rest[2] === 'read') return inbox.markNotificationRead(rest[1]);
      }
      if (rest[0] === 'inbox') {
        if (verb === 'GET' && rest.length === 1) return inbox.listEmails();
        if (verb === 'POST' && rest[2] === 'read') return inbox.markEmailRead(rest[1]);
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
