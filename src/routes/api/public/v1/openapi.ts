// B6.12 — OpenAPI 3.0 spec for the public API.
import { createFileRoute } from "@tanstack/react-router";
import { JSON_HEADERS, preflight } from "@/lib/public-api/auth";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "SohojPharma Public API",
    version: "1.0.0",
    description:
      "Tenant-scoped REST API for mobile apps, AI agents, and third-party integrations. Authenticate with `X-API-Key: pk_<prefix>.<secret>`. Write endpoints additionally require HMAC headers `X-Signature` and `X-Timestamp`.",
  },
  servers: [{ url: "/api/public/v1" }],
  components: {
    securitySchemes: {
      ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: { code: { type: "string" }, message: { type: "string" } },
          },
        },
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          name_bn: { type: "string", nullable: true },
          barcode: { type: "string", nullable: true },
          sku: { type: "string" },
          retail_price: { type: "number" },
          purchase_price: { type: "number" },
          vat_rate: { type: "number" },
          is_active: { type: "boolean" },
          reorder_level: { type: "integer" },
        },
      },
      Customer: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          phone: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          due_balance: { type: "number" },
          credit_limit: { type: "number" },
          is_active: { type: "boolean" },
        },
      },
    },
  },
  security: [{ ApiKey: [] }],
  paths: {
    "/": {
      get: {
        summary: "Gateway info",
        security: [],
        responses: { "200": { description: "OK" } },
      },
    },
    "/products": {
      get: {
        summary: "List products",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "barcode", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 200 } },
          { name: "offset", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "Paginated products",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Product" } },
                    total: { type: "integer" },
                    limit: { type: "integer" },
                    offset: { type: "integer" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/customers": {
      get: {
        summary: "List customers",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 200 } },
          { name: "offset", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "Paginated customers",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Customer" } },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/reports/summary": {
      get: { summary: "Dashboard summary metrics", responses: { "200": { description: "OK" } } },
    },
    "/auth/login": {
      post: {
        summary: "Email/password login (returns access + refresh tokens)",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } } } } } },
        responses: { "200": { description: "Tokens" }, "400": { description: "Invalid" } },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Refresh access token",
        security: [],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["refresh_token"], properties: { refresh_token: { type: "string" } } } } } },
        responses: { "200": { description: "New tokens" } },
      },
    },
    "/auth/logout": { post: { summary: "Invalidate the session", security: [], responses: { "204": { description: "OK" } } } },
    "/auth/profile": { get: { summary: "Authed key info", responses: { "200": { description: "OK" } } } },
    "/auth/tenant": { get: { summary: "Current tenant info", responses: { "200": { description: "OK" } } } },
    "/sales": {
      get: { summary: "List sales", responses: { "200": { description: "OK" } } },
      post: {
        summary: "Create sale (POS checkout)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["invoice_no", "items"], properties: { invoice_no: { type: "string" }, customer_id: { type: "string", format: "uuid" }, payment_method: { type: "string" }, discount: { type: "number" }, paid: { type: "number" }, notes: { type: "string" }, items: { type: "array", minItems: 1, items: { type: "object", required: ["product_id", "qty", "unit_price"], properties: { product_id: { type: "string", format: "uuid" }, batch_id: { type: "string", format: "uuid" }, qty: { type: "number" }, unit_price: { type: "number" }, discount: { type: "number" }, vat: { type: "number" } } } } } } } } },
        responses: { "201": { description: "Created" }, "400": { description: "Invalid" } },
      },
    },
    "/sales/held": {
      get: { summary: "List held carts", responses: { "200": { description: "OK" } } },
      post: {
        summary: "Hold a cart for later",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["cart"], properties: { label: { type: "string" }, customer_id: { type: "string", format: "uuid" }, cart: { type: "object", additionalProperties: true } } } } } },
        responses: { "201": { description: "Held" } },
      },
    },
    "/sales/held/{id}/resume": {
      post: {
        summary: "Resume a held cart",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Resumed" }, "404": { description: "Not found" } },
      },
    },
    "/purchases": { get: { summary: "List purchases", responses: { "200": { description: "OK" } } } },
    "/purchase-orders": { get: { summary: "List purchase orders", responses: { "200": { description: "OK" } } } },
    "/grn": { get: { summary: "List goods receipts", responses: { "200": { description: "OK" } } } },
    "/suppliers": { get: { summary: "List suppliers", responses: { "200": { description: "OK" } } } },
    "/prescriptions": {
      get: { summary: "List prescriptions", responses: { "200": { description: "OK" } } },
      post: {
        summary: "Upload a prescription (multipart)",
        requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" }, customer_id: { type: "string" }, patient_name: { type: "string" }, doctor_name: { type: "string" }, notes: { type: "string" } } } } } },
        responses: { "201": { description: "Uploaded" }, "400": { description: "Invalid" } },
      },
    },
    "/prescriptions/{id}": {
      get: {
        summary: "Prescription detail + 10-min signed URL",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
  },
} as const;

export const Route = createFileRoute("/api/public/v1/openapi")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async () => new Response(JSON.stringify(spec), { headers: JSON_HEADERS }),
    },
  },
});
