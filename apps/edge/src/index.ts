/**
 * The Worker entry point.
 *
 * `fetch` serves the API. `scheduled` runs the one background job this demo
 * needs — releasing inventory reservations whose window has closed — on the
 * cron trigger declared in wrangler.toml. That is deliberately a cron rather
 * than a Queue: a single periodic sweep is all the work there is, and Queues
 * would be infrastructure added for its own sake.
 */

import { createApp } from './http/app';
import type { Env } from './env';
import { Db } from './lib/sql';
import { expireStaleReservations } from './services/inventory';

const app = createApp();

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        try {
          const released = await expireStaleReservations(new Db(env.DB));
          if (released > 0) {
            console.log(
              JSON.stringify({
                level: 'info',
                job: 'expire-reservations',
                released,
                cron: event.cron,
              }),
            );
          }
        } catch (error) {
          console.error(
            JSON.stringify({
              level: 'error',
              job: 'expire-reservations',
              detail: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      })(),
    );
  },
} satisfies ExportedHandler<Env>;
