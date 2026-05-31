# Step 2 · Product CRUD

> **Requirement:** Build a UI and backend for creating, reading, updating, and deleting products. Each product should have at minimum: name, category, price, status (active / inactive), and a timestamp. Store records in Firestore. Expose a clean Data access layer in Node.js (can be Next.js API routes or a separate service).

This document describes how product CRUD is implemented in this project.

---

## Overview

| Concern | Implementation |
|---|---|
| Storage | Firestore `products` collection |
| Data access layer | `lib/db/products.ts` (Firestore helpers) |
| API | Next.js Route Handlers under `app/api/products/` |
| Validation | Zod schemas in `lib/validations/product.ts` |
| UI — list | `/dashboard/products` (TanStack Table) |
| UI — create | `/dashboard/products/new` |
| UI — update | `/dashboard/products/[id]/edit` |
| UI — delete | Inline action on products list (admin only) |

The browser never talks to Firestore directly. All reads and writes go through **API routes → data access layer → Firestore Admin SDK**.

---

## What the requirement means

**CRUD** = Create, Read, Update, Delete — the four basic operations on a resource.

| Operation | Meaning | This project |
|---|---|---|
| **C**reate | Add a new product | `POST /api/products` + `/dashboard/products/new` |
| **R**ead | View one or many products | `GET /api/products`, `GET /api/products/:id` + list & edit pages |
| **U**pdate | Change an existing product | `PUT /api/products/:id` + edit page |
| **D**elete | Remove a product | `DELETE /api/products/:id` + delete button on list |

**Data access layer** = a dedicated module that encapsulates all Firestore queries. API routes call these functions instead of writing Firestore code inline. This keeps persistence logic in one place and makes routes thin.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  UI (React)                                                       │
│  ┌─────────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │ Products list   │  │ New product  │  │ Edit product        │  │
│  │ (TanStack Table)│  │ ProductForm  │  │ ProductForm+initial │  │
│  └────────┬────────┘  └──────┬───────┘  └──────────┬──────────┘  │
│           │                  │                      │             │
│           └──────────────────┴──────────────────────┘             │
│                              │ fetch("/api/products…")            │
│                              │ Authorization: Bearer <token>      │
└──────────────────────────────┼──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  API layer (Next.js Route Handlers)                              │
│  app/api/products/route.ts        → GET (list), POST (create)    │
│  app/api/products/[id]/route.ts   → GET, PUT, DELETE             │
│  • verifyToken() on every request                                │
│  • requireAdmin() on POST, PUT, DELETE                           │
│  • Zod validation on POST, PUT                                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Data access layer — lib/db/products.ts                          │
│  getAllProducts() · getProduct() · createProduct()               │
│  updateProduct() · deleteProduct()                               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Firestore — products collection                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## Data model

### TypeScript type (`types/index.ts`)

```ts
export type ProductStatus = "active" | "inactive";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;           // USD, stored as float
  status: ProductStatus;
  createdBy: string;       // uid of the admin who created it
  createdAt: Date;
  updatedAt: Date;
}
```

### Firestore document shape

```
products/{auto-id}
  name:      string          // required, 2–100 chars
  category:  string          // required, 2–50 chars
  price:     number          // required, positive, max 1_000_000
  status:    "active" | "inactive"
  createdBy: string          // Firebase Auth uid (set server-side)
  createdAt: Timestamp       // set on create
  updatedAt: Timestamp       // set on create and every update
```

The requirement asks for **at minimum** name, category, price, status, and a timestamp. This project stores **two** timestamps (`createdAt`, `updatedAt`) plus `createdBy` for auditability.

**Relationships:** `products.createdBy` → `users/{uid}` (soft reference — enforced in application code, not by Firestore constraints).

---

## Data access layer

All Firestore access for products lives in `lib/db/products.ts`. API routes import from here — they never call `adminDb` directly.

| Function | Firestore operation | Returns |
|---|---|---|
| `getAllProducts()` | `collection("products").orderBy("createdAt", "desc").get()` | `Product[]` |
| `getProduct(id)` | `doc(id).get()` | `Product \| null` |
| `createProduct(data, userId)` | `collection.add({ ...data, createdBy, createdAt, updatedAt })` | new document `id` |
| `updateProduct(id, data)` | `doc(id).update({ ...data, updatedAt })` | `void` |
| `deleteProduct(id)` | `doc(id).delete()` | `void` |

### Design notes

- **Single collection constant** (`COL = "products"`) — easy to rename or mock in tests.
- **Create** uses `.add()` for auto-generated IDs.
- **Update** always refreshes `updatedAt`; `createdAt` and `createdBy` are immutable.
- **Read all** orders by `createdAt` descending (newest first). Requires a Firestore index on `createdAt` (auto-created on first query in dev).

```ts
// lib/db/products.ts — create example
export async function createProduct(
  data: Omit<Product, "id" | "createdAt" | "updatedAt" | "createdBy">,
  userId: string
): Promise<string> {
  const ref = await adminDb.collection(COL).add({
    ...data,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return ref.id;
}
```

---

## Validation

Input is validated with **Zod** before any write reaches Firestore. The same schema is used on the client (instant feedback) and server (authoritative check).

```ts
// lib/validations/product.ts
export const productSchema = z.object({
  name:     z.string().min(2).max(100),
  category: z.string().min(2).max(50),
  price:    z.number().positive().max(1_000_000),
  status:   z.enum(["active", "inactive"]),
});

export const productUpdateSchema = productSchema.partial(); // all fields optional for PUT
```

| Field | Rules |
|---|---|
| `name` | 2–100 characters |
| `category` | 2–50 characters |
| `price` | Positive number, max 1,000,000 |
| `status` | `"active"` or `"inactive"` |

Failed validation returns **422** with field-level errors:

```json
{
  "error": "Validation failed",
  "issues": {
    "name": ["Name must be at least 2 characters"],
    "price": ["Price must be positive"]
  }
}
```

---

## API reference

All endpoints require `Authorization: Bearer <Firebase ID token>`.

### `GET /api/products`

List all products. **Any authenticated user** (admin or viewer).

**Response 200:**
```json
{
  "products": [
    {
      "id": "abc123",
      "name": "Pro Analytics Suite",
      "category": "Analytics",
      "price": 99.99,
      "status": "active",
      "createdBy": "uid_xyz",
      "createdAt": "2026-05-23T...",
      "updatedAt": "2026-05-23T..."
    }
  ]
}
```

### `POST /api/products`

Create a product. **Admin only.**

**Request body:**
```json
{
  "name": "Pro Analytics Suite",
  "category": "Analytics",
  "price": 99.99,
  "status": "active"
}
```

**Response 201:** `{ "id": "abc123" }`  
**Response 403:** Non-admin caller  
**Response 422:** Validation failed

### `GET /api/products/:id`

Get one product by ID. **Any authenticated user.**

**Response 200:** `{ "product": { ... } }`  
**Response 404:** Product not found

### `PUT /api/products/:id`

Update a product. **Admin only.** Partial updates supported via `productUpdateSchema`.

**Request body:** Any subset of `{ name, category, price, status }`

**Response 200:** `{ "success": true }`  
**Response 404:** Product not found

### `DELETE /api/products/:id`

Delete a product permanently (hard delete). **Admin only.**

**Response 200:** `{ "success": true }`  
**Response 404:** Product not found

### HTTP status summary

| Status | When |
|---|---|
| 200 | Successful read, update, or delete |
| 201 | Product created |
| 401 | Missing or invalid token |
| 403 | Authenticated but not admin (write operations) |
| 404 | Product ID not found |
| 422 | Request body failed Zod validation |
| 500 | Unexpected server / Firestore error |

---

## UI

### Products list — `/dashboard/products`

**Read** for all authenticated users. Built with **TanStack Table**.

Features:
- Columns: Name, Category, Price, Status, Actions
- Global search across all fields
- Status filter (All / Active / Inactive)
- Sortable column headers
- Pagination (10 rows per page)
- Admin-only: **New Product** button, Edit and Delete row actions

Data flow:
```
mount → GET /api/products → setProducts → render table
delete → confirm dialog → DELETE /api/products/:id → remove from local state
```

### Create — `/dashboard/products/new`

**Admin only** (no server-side page guard — API enforces admin on POST).

Uses shared `ProductForm` component in create mode:
- Fields: name, category (dropdown + custom "Other"), price, status (radio)
- Client-side Zod validation before submit
- `POST /api/products` on success → toast + redirect to list

### Update — `/dashboard/products/[id]/edit`

1. On mount: `GET /api/products/:id` to load existing data
2. Pre-fills `ProductForm` via `initial` prop
3. On submit: `PUT /api/products/:id` → toast + redirect to list

### Shared form — `ProductForm`

Single component handles both create and edit:

| Prop | Mode |
|---|---|
| (none) | Create — `POST /api/products` |
| `initial={product}` | Edit — `PUT /api/products/:id` |

Category presets: Software, Hardware, Service, Subscription, Analytics, Security, Infrastructure, Other (free-text when "Other" is selected).

---

## End-to-end flows

### Admin creates a product

```
1. Admin clicks "New Product" → /dashboard/products/new
2. Fills form → client validates with productSchema
3. POST /api/products { name, category, price, status }
   → verifyToken() ✓
   → requireAdmin() ✓
   → productSchema.safeParse() ✓
   → createProduct(data, auth.uid) → Firestore .add()
4. Response { id } → redirect to /dashboard/products
```

### Viewer reads products

```
1. Viewer opens /dashboard/products
2. GET /api/products
   → verifyToken() ✓ (role = viewer, allowed)
   → getAllProducts() → Firestore query
3. Table renders — no Edit/Delete buttons (UI hidden)
4. Viewer cannot POST/PUT/DELETE (API returns 403)
```

### Admin updates a product

```
1. Admin clicks Edit → /dashboard/products/:id/edit
2. GET /api/products/:id → pre-fill form
3. Admin changes fields → PUT /api/products/:id
   → verifyToken() ✓ → requireAdmin() ✓
   → productUpdateSchema.safeParse() ✓
   → updateProduct(id, data) → Firestore .update() + updatedAt
4. Redirect to list with success toast
```

### Admin deletes a product

```
1. Admin clicks Delete on a row → confirm("Delete …?")
2. DELETE /api/products/:id
   → verifyToken() ✓ → requireAdmin() ✓
   → getProduct(id) — 404 if missing
   → deleteProduct(id) → Firestore .delete()
3. Row removed from table (optimistic local state update)
```

---

## Authorization integration (Step 1)

Product CRUD reuses the auth system from Step 1:

| Operation | Auth required | Role required |
|---|---|---|
| List products | ✓ | any |
| Get one product | ✓ | any |
| Create product | ✓ | admin |
| Update product | ✓ | admin |
| Delete product | ✓ | admin |

Route protection for `/api/products/*` is configured in `proxy.ts` (session cookie required). Write operations additionally call `requireAdmin()` in the route handler.

---

## Key files

| File | Responsibility |
|---|---|
| `types/index.ts` | `Product`, `ProductStatus` types |
| `lib/db/products.ts` | **Data access layer** — all Firestore CRUD |
| `lib/validations/product.ts` | Zod schemas for create/update |
| `app/api/products/route.ts` | `GET` list, `POST` create |
| `app/api/products/[id]/route.ts` | `GET` one, `PUT` update, `DELETE` delete |
| `app/components/ProductForm.tsx` | Shared create/edit form |
| `app/dashboard/products/page.tsx` | Product list (TanStack Table) |
| `app/dashboard/products/new/page.tsx` | Create page shell |
| `app/dashboard/products/[id]/edit/page.tsx` | Edit page — loads product, renders form |
| `lib/auth/middleware.ts` | `verifyToken()`, `requireAdmin()` |
| `lib/firebase/admin.ts` | Firebase Admin SDK singleton |

---

## Layer responsibilities

Keeping layers separate satisfies the "clean data access layer" requirement:

```
┌─────────────────────────────────────────┐
│  UI          — display, user input      │  ProductForm, products/page.tsx
├─────────────────────────────────────────┤
│  API         — HTTP, auth, validation   │  app/api/products/*
├─────────────────────────────────────────┤
│  Data access — Firestore queries only   │  lib/db/products.ts
├─────────────────────────────────────────┤
│  Database    — persistence              │  Firestore products collection
└─────────────────────────────────────────┘
```

**Rule:** UI calls API. API calls data access layer. Data access layer calls Firestore. No layer skips the one below it.

---

## Trade-offs & scope decisions

| Decision | Rationale |
|---|---|
| **Next.js API routes** (not a separate service) | Single deployable unit; sufficient for this dashboard scope |
| **Hard delete** | Simplest CRUD semantics; production might use soft delete (`deletedAt`) |
| **Fetch-all for list** | Works for small catalogues; large datasets would need cursor pagination (`startAfter`) |
| **No Firestore client SDK in browser** | All access via Admin SDK on server — consistent with Step 1 security model |
| **Dual validation (client + server)** | Client for UX; server for security — never trust client-only validation |
| **Admin-only writes** | Viewers can browse the catalogue but not mutate it |

---

## Manual verification checklist

Sign in as **admin** for create/update/delete tests.

- [ ] Open `/dashboard/products` — list loads (may be empty)
- [ ] Click **New Product** — form renders with all fields
- [ ] Submit with invalid data (empty name, negative price) — validation errors shown
- [ ] Create a valid product — redirects to list, product appears
- [ ] Search and filter by status — table updates correctly
- [ ] Sort by column — order changes
- [ ] Click **Edit** — form pre-filled with existing values
- [ ] Save changes — list reflects update, `updatedAt` changes in Firestore
- [ ] Click **Delete** — confirm dialog, product removed from list and Firestore
- [ ] Sign in as **viewer** — list loads, no New/Edit/Delete controls
- [ ] As viewer, call `POST /api/products` (e.g. via curl) — returns **403**

### Example curl (admin token required)

```bash
# List products
curl -s http://localhost:3000/api/products \
  -H "Authorization: Bearer <ID_TOKEN>"

# Create product (admin only)
curl -s -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer <ID_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Product","category":"Software","price":49.99,"status":"active"}'
```

Replace `<ID_TOKEN>` with a Firebase ID token from a signed-in admin session (browser DevTools → Application → or `getIdToken()` in console while logged in).

---

## Related documentation

- [Step 1 · Authentication & Authorization](./01-authentication-and-authorization.md) — auth, roles, and API guards used by product endpoints
