// Phase 10.2: duplicate-therapy and drug-interaction checks for the POS
// billing screen. Deliberately a "simple lookup," per the phase spec — no
// clinical modeling, just composition-string matching against the cart and
// (if a customer is selected) their recent purchase history, plus the
// small curated InteractionRule starter set. Runs entirely client-side
// against data already fetched, so it's instant as the cart changes and
// never blocks checkout — see SafetyAlertsBanner for the non-blocking
// presentation this feeds.

export type SafetySeverity = "caution" | "warning";

export interface SafetyWarning {
  key: string;
  severity: SafetySeverity;
  message: string;
}

export interface InteractionRuleLite {
  compositionA: string;
  compositionB: string;
  severity: SafetySeverity;
  description: string;
}

export interface CompositionRef {
  name: string;
  composition: string | null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

// Substring match, not exact equality: a rule's compositionA ("Ibuprofen")
// should match an item composition like "Ibuprofen 400mg" or a combination
// composition that includes it.
function compositionIncludes(itemComposition: string, ruleComposition: string): boolean {
  return normalize(itemComposition).includes(normalize(ruleComposition));
}

export function checkSafetyWarnings(
  cartItems: CompositionRef[],
  recentPurchases: CompositionRef[],
  rules: InteractionRuleLite[]
): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];
  const withComposition = cartItems.filter(
    (item): item is { name: string; composition: string } => !!item.composition?.trim()
  );

  // Duplicate therapy within the cart itself.
  for (let i = 0; i < withComposition.length; i++) {
    for (let j = i + 1; j < withComposition.length; j++) {
      const a = withComposition[i];
      const b = withComposition[j];
      if (normalize(a.composition) === normalize(b.composition)) {
        warnings.push({
          key: `dup-cart-${i}-${j}`,
          severity: "caution",
          message: `${a.name} and ${b.name} have the same composition — confirm this is intended.`,
        });
      }
    }
  }

  // Duplicate therapy against the selected customer's recent purchases.
  for (const cartItem of withComposition) {
    for (const past of recentPurchases) {
      if (!past.composition?.trim()) continue;
      if (normalize(cartItem.name) === normalize(past.name)) continue;
      if (normalize(cartItem.composition) === normalize(past.composition)) {
        warnings.push({
          key: `dup-history-${cartItem.name}-${past.name}`,
          severity: "caution",
          message: `Same composition as ${past.name} sold recently — confirm this is intended.`,
        });
      }
    }
  }

  // Seeded interaction pairs, checked both directions across every distinct
  // pair of cart lines.
  for (let i = 0; i < withComposition.length; i++) {
    for (let j = i + 1; j < withComposition.length; j++) {
      const a = withComposition[i];
      const b = withComposition[j];
      for (const rule of rules) {
        const forward = compositionIncludes(a.composition, rule.compositionA) && compositionIncludes(b.composition, rule.compositionB);
        const reverse = compositionIncludes(a.composition, rule.compositionB) && compositionIncludes(b.composition, rule.compositionA);
        if (forward || reverse) {
          warnings.push({
            key: `interaction-${rule.compositionA}-${rule.compositionB}-${i}-${j}`,
            severity: rule.severity,
            message: rule.description,
          });
        }
      }
    }
  }

  return warnings;
}
