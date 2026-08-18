import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  API_SCOPES,
  API_SCOPE_LABELS,
  WRITE_SCOPES,
  isApiScope,
  isWriteScope,
} from "@/lib/api-scopes";

/**
 * Before scopes existed, one API key could call every /api/v1 route — a
 * reporting integration's read-only credential could also POST a sale and
 * decrement stock. The scoping is only worth anything if every route actually
 * declares one, so the load-bearing test here is the source sweep below: it
 * fails when someone adds an endpoint and forgets, which is exactly how this
 * kind of gap reappears.
 */

const V1_DIR = path.join(process.cwd(), "src/app/api/v1");

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === "route.ts" ? [full] : [];
  });
}

describe("every public API route declares a scope", () => {
  const files = routeFiles(V1_DIR);

  it("finds the route files at all", () => {
    // Guards against the sweep passing vacuously if the directory moves.
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map((f) => [path.relative(process.cwd(), f), f]))(
    "%s",
    (_label, file) => {
      const source = fs.readFileSync(file, "utf8");

      // The OpenAPI spec route serves a static document and authenticates
      // nothing — it is the one legitimate exception.
      if (file.endsWith(`openapi${path.sep}route.ts`)) {
        expect(source).not.toContain("authenticateApiRequest");
        return;
      }

      expect(source).toContain("authenticateApiRequest(req, ");

      // Every call site must name a scope from the catalog, not a free string.
      const calls = [...source.matchAll(/authenticateApiRequest\(req,\s*"([^"]+)"\)/g)];
      expect(calls.length).toBeGreaterThan(0);
      for (const [, scope] of calls) {
        expect(isApiScope(scope)).toBe(true);
      }

      // A route that writes must not be gated behind a read scope.
      const isWriteRoute = /export async function (POST|PUT|PATCH|DELETE)/.test(source);
      if (isWriteRoute) {
        expect(calls.every(([, scope]) => isWriteScope(scope))).toBe(true);
      }
    }
  );

  it("guards no route with a scope missing from the catalog", () => {
    const used = new Set<string>();
    for (const file of files) {
      for (const [, scope] of fs
        .readFileSync(file, "utf8")
        .matchAll(/authenticateApiRequest\(req,\s*"([^"]+)"\)/g)) {
        used.add(scope);
      }
    }
    for (const scope of used) expect(isApiScope(scope)).toBe(true);
  });

  it("documents every scope in the OpenAPI spec", () => {
    // A scope nobody can discover is a scope nobody will grant correctly.
    const spec = fs.readFileSync(path.join(V1_DIR, "openapi/route.ts"), "utf8");
    for (const scope of API_SCOPES) {
      expect(spec).toContain(`"${scope}"`);
    }
  });
});

describe("the scope catalog", () => {
  it("labels every scope for the settings UI", () => {
    for (const scope of API_SCOPES) {
      expect(API_SCOPE_LABELS[scope]).toBeTruthy();
    }
    expect(Object.keys(API_SCOPE_LABELS).sort()).toEqual([...API_SCOPES].sort());
  });

  it("has no duplicates", () => {
    expect(new Set(API_SCOPES).size).toBe(API_SCOPES.length);
  });

  it("classifies write scopes by their action, not by hand", () => {
    for (const scope of API_SCOPES) {
      expect(isWriteScope(scope)).toBe(scope.endsWith(":write"));
    }
    expect(WRITE_SCOPES.every((s) => API_SCOPES.includes(s))).toBe(true);
  });

  it("rejects strings that are not scopes", () => {
    for (const value of ["", "admin", "sales", "sales:read ", "*", "sales:*"]) {
      expect(isApiScope(value)).toBe(false);
    }
  });
});
