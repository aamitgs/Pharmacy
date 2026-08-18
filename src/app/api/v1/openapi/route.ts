import { NextResponse } from "next/server";

// Hand-written OpenAPI 3.0 spec for the versioned public API — kept in one
// file next to the routes it describes so a route change is a visible
// prompt to update this too, rather than a separate generator step that's
// easy to forget.
const OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "Pharmacy Billing Public API",
    version: "1.0.0",
    description:
      "Read-only access to invoices, stock, and customers, a narrow create-sale endpoint for headless integrations, and (hospital-mode tenants only) endpoints for an external HIS to push patient admissions and pull ward stock/consumption. Authenticate with an API key generated in Settings > API, sent as `Authorization: Bearer <key>`.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
      // Scopes are listed per operation below. A key carries only the scopes
      // chosen when it was created, and a call outside them returns 403 —
      // so read-only integrations cannot be repurposed to write.
      ApiKeyAuth: { type: "http", scheme: "bearer", bearerFormat: "phk_..." },
    },
    schemas: {
      Invoice: {
        type: "object",
        properties: {
          id: { type: "string" },
          invoiceNo: { type: "string" },
          invoiceDate: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["completed", "cancelled"] },
          paymentMode: { type: "string", enum: ["cash", "upi", "card", "credit"] },
          subtotal: { type: "number" },
          taxAmount: { type: "number" },
          discountAmount: { type: "number" },
          total: { type: "number" },
        },
      },
      StockItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          hsnCode: { type: "string", nullable: true },
          unit: { type: "string" },
          totalQty: { type: "integer" },
          batches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                batchNo: { type: "string" },
                expiryDate: { type: "string", format: "date-time" },
                qty: { type: "integer" },
                mrp: { type: "number" },
              },
            },
          },
        },
      },
      Customer: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          phone: { type: "string", nullable: true },
          creditLimit: { type: "number", nullable: true },
          outstandingBalance: { type: "number" },
        },
      },
      Ward: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string", enum: ["icu", "ot", "general", "pharmacy_substore"] },
          branchId: { type: "string" },
        },
      },
      UpsertAdmissionRequest: {
        type: "object",
        required: ["admissionRef", "patientName", "wardId"],
        properties: {
          admissionRef: { type: "string", description: "Your HIS's own admission reference — used as the upsert key." },
          patientName: { type: "string" },
          wardId: { type: "string" },
          dischargedAt: { type: "string", format: "date-time", nullable: true, description: "Set to mark/update a discharge; omit to leave unchanged." },
        },
      },
      CreateSaleRequest: {
        type: "object",
        required: ["branchId", "paymentMode", "items"],
        properties: {
          branchId: { type: "string" },
          customerId: { type: "string" },
          paymentMode: { type: "string", enum: ["cash", "upi", "card"] },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["itemId", "qty"],
              properties: { itemId: { type: "string" }, qty: { type: "integer", minimum: 1 } },
            },
          },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    "/invoices": {
      get: {
        summary: "List invoices",
        security: [{ ApiKeyAuth: ["invoices:read"] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Invoice" } } } } } },
          },
        },
      },
    },
    "/invoices/{id}": {
      get: {
        summary: "Get one invoice, with line items",
        security: [{ ApiKeyAuth: ["invoices:read"] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found" },
        },
      },
    },
    "/stock": {
      get: {
        summary: "List items with per-batch stock levels",
        security: [{ ApiKeyAuth: ["stock:read"] }],
        parameters: [{ name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } }],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/StockItem" } } } } } },
          },
        },
      },
    },
    "/customers": {
      get: {
        summary: "List customers",
        security: [{ ApiKeyAuth: ["customers:read"] }],
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Customer" } } } } } },
          },
        },
      },
    },
    "/sales": {
      post: {
        summary: "Create a sale (narrower than the in-app POS — no prescription items, discounts, schemes, or coupons)",
        security: [{ ApiKeyAuth: ["sales:write"] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateSaleRequest" } } },
        },
        responses: {
          "201": { description: "Created" },
          "400": { description: "Validation error" },
          "429": { description: "Rate limited — 60 requests/minute per key" },
        },
      },
    },
    "/wards": {
      get: {
        summary: "List wards (hospital-mode tenants only) — map your own ward codes to these ids",
        security: [{ ApiKeyAuth: ["wards:read"] }],
        responses: {
          "200": {
            description: "OK",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Ward" } } } } } },
          },
          "403": { description: "Not a hospital-mode tenant" },
        },
      },
    },
    "/wards/{id}/stock": {
      get: {
        summary: "Current stock at a ward",
        security: [{ ApiKeyAuth: ["wards:read"] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found" },
          "403": { description: "Not a hospital-mode tenant" },
        },
      },
    },
    "/wards/{id}/consumption": {
      get: {
        summary: "Recent IPD dispenses at a ward, across all admissions",
        security: [{ ApiKeyAuth: ["wards:read"] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 100, maximum: 500 } },
        ],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found" },
          "403": { description: "Not a hospital-mode tenant" },
        },
      },
    },
    "/admissions": {
      post: {
        summary: "Create or update a patient admission, keyed by your own admissionRef (hospital-mode tenants only)",
        security: [{ ApiKeyAuth: ["admissions:write"] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UpsertAdmissionRequest" } } },
        },
        responses: {
          "201": { description: "Created/updated" },
          "400": { description: "Validation error" },
          "403": { description: "Not a hospital-mode tenant" },
        },
      },
    },
    "/admissions/{ref}": {
      get: {
        summary: "Consumption/charges for one admission (by your own admissionRef) — what an external HIS builds its bill from",
        security: [{ ApiKeyAuth: ["admissions:read"] }],
        parameters: [{ name: "ref", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found" },
          "403": { description: "Not a hospital-mode tenant" },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC);
}
