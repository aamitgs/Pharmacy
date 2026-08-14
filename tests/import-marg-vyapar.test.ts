import { describe, it, expect } from "vitest";
import { parseIndianDayFirstDate, parseMonthYearExpiry, normalizeExpiryDate } from "@/lib/import/date-parse";
import { parseMargCsv } from "@/lib/import/marg-parser";
import { parseVyaparCsv } from "@/lib/import/vyapar-parser";
import { validateRows } from "@/lib/import/validate";

describe("parseIndianDayFirstDate", () => {
  it("parses an unambiguous day-first date", () => {
    expect(parseIndianDayFirstDate("14/08/2026")).toBe("2026-08-14");
    expect(parseIndianDayFirstDate("14-08-2026")).toBe("2026-08-14");
  });

  it("parses an AMBIGUOUS day-first date correctly, rather than silently swapping day/month", () => {
    // This is exactly the case new Date("05/08/2026") gets wrong (May 8th).
    expect(parseIndianDayFirstDate("05/08/2026")).toBe("2026-08-05");
  });

  it("2-digit years pivot at 70 (>=70 -> 1900s, <70 -> 2000s)", () => {
    expect(parseIndianDayFirstDate("01/01/26")).toBe("2026-01-01");
    expect(parseIndianDayFirstDate("01/01/95")).toBe("1995-01-01");
  });

  it("rejects an out-of-range day for the given month instead of guessing", () => {
    expect(parseIndianDayFirstDate("30/02/2026")).toBeNull();
  });

  it("rejects garbage instead of guessing", () => {
    expect(parseIndianDayFirstDate("not a date")).toBeNull();
    expect(parseIndianDayFirstDate("")).toBeNull();
  });
});

describe("parseMonthYearExpiry", () => {
  it("resolves to the last day of the given month (documented convention, not a guess)", () => {
    expect(parseMonthYearExpiry("08/26")).toBe("2026-08-31");
    expect(parseMonthYearExpiry("02-2027")).toBe("2027-02-28");
  });

  it("rejects an invalid month instead of guessing", () => {
    expect(parseMonthYearExpiry("13/26")).toBeNull();
  });
});

describe("normalizeExpiryDate", () => {
  it("passes through anything it can't confidently parse, so it gets flagged rather than silently dropped", () => {
    expect(normalizeExpiryDate("sometime next year")).toBe("sometime next year");
  });
});

describe("parseMargCsv", () => {
  it("recognizes Marg's common column aliases and normalizes a month/year-only expiry", () => {
    const rows = parseMargCsv([
      {
        "Item Name": "Paracetamol 650",
        Company: "Cipla",
        HSN: "3004",
        "GST%": "12",
        Batch: "PCM99",
        Expiry: "08/26",
        "M.R.P.": "35",
        "Sales Rate": "30",
        Stock: "100",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Paracetamol 650");
    expect(rows[0].manufacturer).toBe("Cipla");
    expect(rows[0].expiryDate).toBe("2026-08-31");
    expect(rows[0].mrp).toBe("35");
  });

  it("flags an unrecognizable expiry format instead of guessing — the row fails validation", () => {
    const rows = parseMargCsv([
      { "Item Name": "Test Item", Batch: "B1", Expiry: "garbled-date", "M.R.P.": "10", "Sales Rate": "9" },
    ]);
    const { rows: validated } = validateRows(rows);
    expect(validated[0].errors).toContain("Expiry date is not a valid date");
  });
});

describe("parseVyaparCsv", () => {
  it("recognizes Vyapar's common column aliases and normalizes a day-first expiry", () => {
    const rows = parseVyaparCsv([
      {
        "Item Name": "Cough Syrup",
        "HSN Code": "3004",
        "Sale Price": "90",
        "Batch No": "CS01",
        "Expiry Date": "05/08/2026",
        MRP: "95",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Cough Syrup");
    // 05/08/2026 must resolve to 5th August, not May 8th.
    expect(rows[0].expiryDate).toBe("2026-08-05");
  });

  it("produces rows that pass through validateRows unchanged in shape", () => {
    const rows = parseVyaparCsv([
      { "Item Name": "Item A", "Batch No": "B1", "Expiry Date": "01/01/2027", MRP: "20", "Sale Price": "18" },
    ]);
    const { validCount, invalidCount } = validateRows(rows);
    expect(validCount).toBe(1);
    expect(invalidCount).toBe(0);
  });
});
