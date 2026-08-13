/**
 * SQL emission helpers for the D1 seed.
 *
 * Values are escaped here rather than concatenated ad hoc by each caller, and
 * the escaping is the strict kind: strings are single-quote-doubled, numbers
 * must actually be finite numbers, booleans become 0/1, and anything else is
 * a thrown error rather than a silent `undefined` reaching the database.
 *
 * The seed builds a file of statements instead of issuing them one at a time
 * because `wrangler d1 execute --file` is the free, offline-capable way to load
 * a D1 database, local or remote, and it applies the whole file in order.
 */

/** SQL literal for a value. Throws rather than guessing. */
export function lit(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in seed: ${value}`);
    return String(value);
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  throw new Error(`Unsupported seed value type: ${typeof value}`);
}

/** JSON column: stringified, then escaped as a string literal. */
export const json = (value) => lit(JSON.stringify(value ?? null));

/**
 * An idempotent INSERT.
 *
 * `ON CONFLICT DO NOTHING` is what makes `db:seed` safe to run twice: a second
 * run adds nothing and changes nothing. Rows the demo is *expected* to keep
 * current (settings, content) use `upsert` below instead.
 */
export function insert(table, row) {
  const columns = Object.keys(row);
  const values = columns.map((column) => lit(row[column]));
  return `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT DO NOTHING;`;
}

/** Insert, or overwrite the listed columns when the row already exists. */
export function upsert(table, row, conflictColumns, updateColumns) {
  const columns = Object.keys(row);
  const values = columns.map((column) => lit(row[column]));
  const updates = updateColumns.map((column) => `"${column}" = excluded."${column}"`).join(', ');
  return (
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) ` +
    `VALUES (${values.join(', ')}) ` +
    `ON CONFLICT (${conflictColumns.map((c) => `"${c}"`).join(', ')}) DO UPDATE SET ${updates};`
  );
}

/**
 * A deterministic PRNG, so two runs of the seed produce byte-identical data.
 *
 * A demo whose order history reshuffles on every reseed is one where "did that
 * change because of my code?" has no answer. mulberry32, same as the review
 * generator in @outlet/domain.
 */
export function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export const pick = (random, options) => options[Math.floor(random() * options.length) % options.length];

/** ISO-8601 UTC with milliseconds — the format every timestamp column holds. */
export const iso = (date) => new Date(date).toISOString();

export const daysAgo = (base, days) => iso(base.getTime() - days * 24 * 60 * 60 * 1000);
export const daysAhead = (base, days) => iso(base.getTime() + days * 24 * 60 * 60 * 1000);
