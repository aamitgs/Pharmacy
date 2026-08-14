function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Finds the first header in `headers` matching any of `aliases`, ignoring
 * case/punctuation/whitespace — used by the Marg/Vyapar pre-parsers to
 * recognize a target field under whatever header text that export used. */
export function findColumn(headers: string[], aliases: string[]): string | undefined {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.find((h) => normalizedAliases.includes(normalizeHeader(h)));
}
