/**
 * Telling a customer something happened, with no email provider.
 *
 * Every place the platform would have emailed somebody calls `notify`. It
 * writes two rows: the in-app notification the bell shows, and the message in
 * the simulated mailbox at `/account/inbox` — the record of the mail a real
 * deployment would have sent. Nothing is transmitted. There is no SMTP client
 * in this Worker and no provider credential it could use if there were.
 *
 * Both rows come back as statements rather than being executed, so a caller
 * can batch them with the change they describe. An order that is placed and a
 * confirmation that is not written is worse than either alone.
 */

import type { Db } from '../lib/sql';
import { newId } from '../lib/ids';
import { nowIso } from '../lib/sql';

export interface Notification {
  userId: string;
  /** The notification type the bell groups on: ORDER_PLACED, ORDER_STATUS, … */
  type: string;
  title: string;
  body: string;
  /** The address the mail was addressed to; omitted, no mailbox copy is written. */
  email?: string | null;
  orderId?: string | null;
  /** Defaults to the lowercased type, which is already the template vocabulary. */
  template?: string;
  at?: string;
}

export function notify(db: Db, notification: Notification) {
  const now = notification.at ?? nowIso();
  const statements = [
    db.statement(
      `INSERT INTO "notifications" ("id", "userId", "type", "title", "body", "orderId", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      notification.userId,
      notification.type,
      notification.title,
      notification.body,
      notification.orderId ?? null,
      now,
    ),
  ];

  /*
   * A guest checkout has an address but no account, and an account is what the
   * mailbox is keyed on — there would be nowhere to read the message back.
   * Those customers get the confirmation on the order page instead.
   */
  if (notification.email) {
    statements.push(
      db.statement(
        `INSERT INTO "simulated_emails"
           ("id", "userId", "orderId", "to", "subject", "body", "template", "sentAt")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        newId(),
        notification.userId,
        notification.orderId ?? null,
        notification.email,
        notification.title,
        notification.body,
        notification.template ?? notification.type.toLowerCase(),
        now,
      ),
    );
  }

  return statements;
}
