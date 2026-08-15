-- The simulated mailbox.
--
-- This deployment has no email provider, by design (SECURITY.md). Rather than
-- have order confirmations and shipping updates go nowhere, the message a real
-- system would have sent is written here and read back at /account/inbox. It
-- is a record of what *would* have been sent; nothing leaves the Worker, and
-- there is no SMTP transport in the build at all.
--
-- `to` holds the address the mail was addressed to, so the customer can see it
-- was theirs. It is copied from the user at write time rather than joined, for
-- the same reason an order stores the address it shipped to: changing your
-- email later must not rewrite what an old message says.

CREATE TABLE "simulated_emails" (
  "id"       TEXT PRIMARY KEY,
  "userId"   TEXT NOT NULL,
  "orderId"  TEXT,
  "to"       TEXT NOT NULL,
  "subject"  TEXT NOT NULL,
  "body"     TEXT NOT NULL,
  -- Which message this is: order_confirmation, order_status, return_requested…
  -- The same vocabulary a template name would have, so swapping a real
  -- provider in later is a matter of rendering these, not of finding them.
  "template" TEXT NOT NULL,
  "readAt"   TEXT,
  "sentAt"   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE,
  FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE SET NULL
);

CREATE INDEX "simulated_emails_user_idx" ON "simulated_emails" ("userId", "sentAt" DESC);
CREATE INDEX "simulated_emails_unread_idx" ON "simulated_emails" ("userId") WHERE "readAt" IS NULL;

-- Which order a notification is about, so the inbox can link to it.
--
-- Added as a nullable column with no default: SQLite only permits ALTER TABLE
-- ADD COLUMN with a REFERENCES clause when the default is NULL, and a
-- notification about a newsletter or an account change is about no order.
ALTER TABLE "notifications" ADD COLUMN "orderId" TEXT REFERENCES "orders" ("id") ON DELETE SET NULL;

CREATE INDEX "notifications_unread_idx" ON "notifications" ("userId") WHERE "readAt" IS NULL;
