/**
 * CSV, in both directions.
 *
 * The admin panel exports a file, an operator edits it in a spreadsheet, and the
 * panel imports it back. That round trip is the whole point, so these two
 * functions are each other's inverse and the column formats live beside the
 * routes that use them — the same format the NestJS implementation writes, so a
 * file exported from either stack imports into either stack.
 */

/**
 * One field, quoted only when it has to be.
 *
 * A product name containing a comma is the ordinary case, not the exotic one
 * ("Jacket, quilted"), and an unquoted one silently shifts every later column of
 * that row.
 */
export function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /["\n\r,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row, from values that may each need quoting. */
export const csvRow = (values: Array<string | number | null | undefined>): string =>
  values.map(csvEscape).join(',');

/** A whole file: header first, `\r\n` so Excel does not run the rows together. */
export const csvFile = (header: string, rows: string[]): string =>
  [header, ...rows].join('\r\n');

/**
 * One line back into fields, honouring quotes.
 *
 * `line.split(',')` is what this replaces. It is correct until the first quoted
 * field containing a comma — which is exactly what our own export produces — at
 * which point every column after it in that row is read as the wrong thing.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((field) => field.trim());
}

/**
 * A file as a header-indexed reader.
 *
 * Columns are addressed by name rather than by position because a spreadsheet
 * round trip reorders them freely, and a positional reader would then write a
 * price into a SKU without noticing.
 */
export interface CsvTable {
  rows: Array<(column: string) => string>;
  has(column: string): boolean;
  count: number;
}

export function readCsvTable(csv: string): CsvTable {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], has: () => false, count: 0 };

  const header = parseCsvLine(lines[0]);
  const indexOf = (column: string) => header.indexOf(column);

  const rows = lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    return (column: string): string => {
      const index = indexOf(column);
      return index === -1 ? '' : (fields[index] ?? '');
    };
  });

  return { rows, has: (column) => indexOf(column) !== -1, count: rows.length };
}

/** Headers that make a browser download the body as a file. */
export const csvHeaders = (filename: string): Record<string, string> => ({
  'content-type': 'text/csv; charset=utf-8',
  'content-disposition': `attachment; filename="${filename}"`,
  // A stale export is worse than a slow one: these are read as a source of truth.
  'cache-control': 'no-store',
});
