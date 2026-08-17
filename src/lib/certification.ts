// The guided walkthrough (Phase 10.3) is only ever shown to these roles —
// an Owner set the system up themselves, and a Ward Nurse's job doesn't
// touch billing/discounts/Schedule H, so "certified" only means anything
// for these two (ward_pharmacist is treated the same as pharmacist
// elsewhere in this app, e.g. MFA requirements, so it's included here too).
// Untyped as UserRole (kept a plain string set) so it can be checked
// against both the Prisma-typed role on a fetched User row and the looser
// string-typed role already threaded through AppShell/StaffPanel's props.
export const CERTIFIABLE_ROLES: ReadonlySet<string> = new Set(["counter_staff", "pharmacist", "ward_pharmacist"]);
