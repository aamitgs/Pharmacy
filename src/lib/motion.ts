/**
 * Phase 11.5: one shared duration for every "confirmation state" toast in
 * the app (sale completion, cart line removal/undo, discount approval) —
 * previously each call site picked its own number (or none at all), which
 * is exactly the kind of per-screen drift this phase's design direction
 * calls out. 4000ms matches sonner's own library default, made explicit
 * and shared rather than left implicit in some call sites and overridden
 * ad hoc in others.
 */
export const CONFIRMATION_TOAST_DURATION_MS = 4000;
