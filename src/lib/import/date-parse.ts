// Both Marg and Vyapar commonly export dates in Indian day-first formats
// (DD-MM-YYYY / DD/MM/YYYY) that `new Date(string)` cannot be trusted with:
// for an unambiguous day (e.g. "14/08/2026") JS's Date correctly rejects it
// as invalid MM/DD, but for an AMBIGUOUS one (e.g. "05/08/2026") it silently
// parses as May 8th instead of 5th August — a silent wrong answer, not a
// caught error. These helpers parse the day-first format explicitly instead
// of ever handing an ambiguous string to `new Date()`.

/** Parses a strict DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY date into ISO
 * (YYYY-MM-DD). Returns null — never a guess — for anything that doesn't
 * match the pattern or has an out-of-range day/month, so the caller can
 * leave the original string in place and let the existing "is this a valid
 * date" check flag it visibly instead of silently misinterpreting it. */
export function parseIndianDayFirstDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Marg's pharma-specific convention: batch expiry is commonly recorded as
 * month/year only (e.g. "08/26", "08-2026") since the day-of-month is
 * regulatorily irrelevant for a medicine's expiry. Interpreted
 * deterministically as the LAST day of that month — an established
 * industry convention for month/year-only expiry, not a per-row guess.
 * Returns null (never a fabricated date) for anything that doesn't match. */
export function parseMonthYearExpiry(raw: string): string | null {
  const match = raw.trim().match(/^(\d{1,2})[-/](\d{2,4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  let year = Number(match[2]);
  if (year < 100) year += year < 70 ? 2000 : 1900;
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Tries the day-first full date first, then falls back to month/year-only.
 * Anything unrecognized is returned unchanged so it visibly fails the
 * existing expiry-date validation rather than being dropped or guessed. */
export function normalizeExpiryDate(raw: string): string {
  return parseIndianDayFirstDate(raw) ?? parseMonthYearExpiry(raw) ?? raw;
}
