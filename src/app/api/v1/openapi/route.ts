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
      "Read-only access to invoices, stock, and customers, plus a narrow create-sale endpoint for headless integrations. Authenticate with an API key generated in Settings > API, sent as `Authorization: Bearer <key>`.",
  },
  servers: [{ url: "/api/v1" }],
  components: {
    securitySchemes: {
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
  },
};

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC);
}
