/**
 * Authorization.
 *
 * The rule the whole admin surface rests on: a permission is checked here, on
 * the server, against roles loaded from the database — never inferred from
 * anything the client sent. The admin panel hides buttons the user cannot use,
 * but that is presentation. Removing the button and calling the endpoint
 * directly must still fail, and every admin route below goes through
 * `requirePermission` to make sure it does.
 */

import type { PermissionKey } from '@outlet/types';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import type { AuthenticatedSession } from './session';
import { Db, nowIso, toJson } from '../lib/sql';
import { newId } from '../lib/ids';

export function requireSession(session: AuthenticatedSession | null): AuthenticatedSession {
  if (!session) throw unauthorized();
  return session;
}

export function requirePermission(
  session: AuthenticatedSession | null,
  permission: PermissionKey,
): AuthenticatedSession {
  const active = requireSession(session);
  if (!active.permissions.has(permission)) {
    throw forbidden(`This action requires the "${permission}" permission.`);
  }
  return active;
}

/** True when the user holds any admin-side permission at all. */
export const isStaff = (session: AuthenticatedSession | null): boolean =>
  Boolean(session && session.permissions.size > 0);

/**
 * Ownership check for customer-scoped resources.
 *
 * This is the IDOR guard: a row is loaded by id and *then* compared to the
 * caller. Staff with the matching view permission may look at anyone's; a
 * customer may only see their own, and gets 404 rather than 403 so the API
 * does not confirm that someone else's order id exists.
 */
export function requireOwnership(
  session: AuthenticatedSession,
  ownerUserId: string | null,
  staffPermission?: PermissionKey,
): void {
  if (ownerUserId && ownerUserId === session.user.id) return;
  if (staffPermission && session.permissions.has(staffPermission)) return;
  throw notFound();
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Writes an audit row.
 *
 * Called for every administrative mutation. The actor's email is denormalised
 * onto the row so the log still reads correctly after the account is deleted,
 * and `before`/`after` are stored as JSON so a reviewer can see what actually
 * changed rather than just that something did.
 */
export function auditStatement(
  db: Db,
  session: AuthenticatedSession | null,
  ip: string | null,
  entry: AuditEntry,
): D1PreparedStatement {
  return db.statement(
    `INSERT INTO "audit_logs"
       ("id", "actorUserId", "actorEmail", "actorType", "action", "entityType",
        "entityId", "before", "after", "reason", "ip", "createdAt")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(),
    session?.user.id ?? null,
    session?.user.email ?? null,
    session ? (session.permissions.size > 0 ? 'ADMIN' : 'CUSTOMER') : 'SYSTEM',
    entry.action,
    entry.entityType,
    entry.entityId ?? null,
    entry.before === undefined ? null : toJson(entry.before),
    entry.after === undefined ? null : toJson(entry.after),
    entry.reason ?? null,
    ip,
    nowIso(),
  );
}

export async function writeAudit(
  db: Db,
  session: AuthenticatedSession | null,
  ip: string | null,
  entry: AuditEntry,
): Promise<void> {
  await auditStatement(db, session, ip, entry).run();
}
