# Step 4 · Database Design

> **Requirement:** Document your Firestore data model — collections, documents, fields, and any subcollections. Explain your indexing strategy and how the schema would evolve if, say, you needed to add multi-tenancy or 10× the number of products.

This document describes the Firestore schema, query patterns, indexing strategy, and planned evolution paths for this project.

---

## Overview

| Concern | Implementation |
|---|---|
| Database | Google Cloud Firestore (Native mode) |
| Access path | Firebase Admin SDK only — server-side via `lib/db/*.ts` |
| Collections | 2 top-level: `users`, `products` |
| Subcollections | None |
| Client direct access | None — browser never reads/writes Firestore |
| Security rules | Not used — all access gated by Next.js API + Admin SDK |
| Relationships | Soft references (string IDs), no foreign keys |

Firestore is used as a **document store** with flat top-level collections. The schema is intentionally minimal for a single-tenant SaaS dashboard with two roles and a product catalogue.

---

## Entity-relationship diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Firebase Authentication (not Firestore)                       │
│  uid, email, password hash — managed by Firebase Auth          │
└────────────────────────────┬────────────────────────────────────┘
                             │ 1:1 document ID match
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  users/{uid}                                                     │
│    email, role, createdAt                                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ soft reference (products.createdBy)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  products/{auto-id}                                              │
│    name, category, price, status, createdBy, createdAt, updatedAt │
└─────────────────────────────────────────────────────────────────┘
```

**Key design choice:** User document IDs **match** Firebase Auth UIDs (`users/{uid}`). This gives O(1) lookup by auth identity without a separate mapping table.

---

## Collections

### Summary

| Collection | Document ID | Purpose | Approx. size (current) |
|---|---|---|---|
| `users` | Firebase Auth `uid` | Profile + role for authorization | 1 doc per registered user |
| `products` | Auto-generated | Product catalogue | 1 doc per product |

There are **no subcollections** in the current schema. All data lives at the top level.

---

## `users` collection

### Path

```
users/{uid}
```

`uid` is the Firebase Authentication user ID — set explicitly on create, not auto-generated.

### Fields

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `email` | `string` | ✓ | ✗* | User's email address (mirrors Auth) |
| `role` | `"admin"` \| `"viewer"` | ✓ | ✓ | Authorization role — read on every API request |
| `createdAt` | `Timestamp` | ✓ | ✗ | Account creation time |

\* Email is not updated in Firestore if changed in Auth — out of scope for this app.

### Example document

```json
{
  "email": "alice@example.com",
  "role": "admin",
  "createdAt": "2026-05-23T10:30:00.000Z"
}
```

### TypeScript type

```ts
// types/index.ts
export interface User {
  id: string;       // same as Firebase Auth uid
  email: string;
  role: "admin" | "viewer";
  createdAt: Date;
}
```

### Access patterns

| Operation | Query | Used by |
|---|---|---|
| Get one user | `users.doc(uid).get()` | `verifyToken()`, `/api/auth/me` |
| Create user | `users.doc(uid).set({...})` | `POST /api/auth/register` |
| List all users | `users.orderBy("createdAt", "desc").get()` | `GET /api/users` (admin) |
| Update role | `users.doc(uid).update({ role })` | `PATCH /api/users/:id` (admin) |

### Design notes

- **Role in Firestore, not custom claims** — role changes take effect on the next API request without reissuing tokens. Trade-off: one Firestore read per authenticated API call.
- **No password field** — credentials live in Firebase Auth only.
- **No user profile fields** — name, avatar, preferences omitted to keep scope minimal.

---

## `products` collection

### Path

```
products/{auto-id}
```

Document IDs are **auto-generated** by Firestore on `.add()`.

### Fields

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `name` | `string` | ✓ | ✓ | Product display name (2–100 chars) |
| `category` | `string` | ✓ | ✓ | Free-form category label (2–50 chars) |
| `price` | `number` | ✓ | ✓ | USD price stored as float |
| `status` | `"active"` \| `"inactive"` | ✓ | ✓ | Whether product is active in catalogue |
| `createdBy` | `string` | ✓ | ✗ | Firebase Auth uid of creating admin |
| `createdAt` | `Timestamp` | ✓ | ✗ | Document creation time |
| `updatedAt` | `Timestamp` | ✓ | ✓ | Last modification time (refreshed on every update) |

### Example document

```json
{
  "name": "Pro Analytics Suite",
  "category": "Analytics",
  "price": 99.99,
  "status": "active",
  "createdBy": "abc123uid",
  "createdAt": "2026-05-23T11:00:00.000Z",
  "updatedAt": "2026-05-23T11:00:00.000Z"
}
```

### TypeScript type

```ts
// types/index.ts
export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  status: "active" | "inactive";
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Access patterns

| Operation | Query | Used by |
|---|---|---|
| List all (newest first) | `products.orderBy("createdAt", "desc").get()` | `GET /api/products`, product list UI |
| List all (oldest first) | `products.orderBy("createdAt", "asc").get()` | `GET /api/analytics` |
| Get one | `products.doc(id).get()` | `GET /api/products/:id`, edit page |
| Create | `products.add({...})` | `POST /api/products` |
| Update | `products.doc(id).update({...})` | `PUT /api/products/:id` |
| Delete | `products.doc(id).delete()` | `DELETE /api/products/:id` |

### Design notes

- **`createdBy` is a soft reference** — Firestore does not enforce that `users/{createdBy}` exists. Deleting a user does not cascade to their products.
- **`category` is a string, not a reference** — no separate `categories` collection. Simpler for small catalogues; duplicates category names across documents.
- **Hard delete** — documents are removed permanently. No `deletedAt` or archive flag.
- **Price as float** — acceptable for display/catalogue use. A billing system would store integer cents to avoid floating-point issues.

---

## Subcollections

**None.** The current schema uses flat top-level collections only.

This was a deliberate simplification:

| Flat collections (current) | Subcollections (alternative) |
|---|---|
| Simple queries across all products | Natural tenant isolation (`orgs/{id}/products`) |
| Easy to list everything | Harder to query across tenants |
| Fine for single-tenant / small scale | Better for strict data isolation |

If multi-tenancy is added, subcollections become more attractive — see [Evolution: multi-tenancy](#evolution-multi-tenancy) below.

---

## Relationships

```
users/{uid}  ◄──── products.createdBy  (many products → one user)
```

| Relationship | Type | Enforced by |
|---|---|---|
| User → Products | One-to-many (creator) | Application (`createdBy` set from `auth.uid` on create) |
| User role → API access | Logical | `verifyToken()` + `requireAdmin()` |
| Product → User (creator) | Optional join | Not queried — `createdBy` stored for audit only |

There is **no join query** in the current app. The dashboard never displays creator email alongside products. A future enhancement could batch-fetch user docs by `createdBy` uid.

---

## Data access layer

All Firestore reads and writes are isolated in `lib/db/`:

```
lib/db/
  users.ts     → users collection CRUD
  products.ts  → products collection CRUD
```

API routes and analytics handlers call these modules — they do not construct Firestore queries inline (except `app/api/analytics/route.ts`, which queries products directly for aggregation).

```ts
// lib/db/products.ts
const COL = "products";

export async function getAllProducts(): Promise<Product[]> {
  const snapshot = await adminDb
    .collection(COL)
    .orderBy("createdAt", "desc")
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Product[];
}
```

**Benefit:** Schema or query changes happen in one place. API routes stay thin.

---

## Indexing strategy

Firestore requires indexes for compound queries (`where` + `orderBy` on different fields). Single-field indexes are **automatic**.

### Current queries and index requirements

| Query | Index needed | Status |
|---|---|---|
| `products.orderBy("createdAt", "desc")` | Single-field on `createdAt` | Auto-created |
| `products.orderBy("createdAt", "asc")` | Single-field on `createdAt` | Auto-created |
| `users.orderBy("createdAt", "desc")` | Single-field on `createdAt` | Auto-created |
| `users.doc(uid).get()` | Document ID lookup | Built-in |
| `products.doc(id).get()` | Document ID lookup | Built-in |

No **composite indexes** are required today because there are no `where` clauses combined with `orderBy`.

### Index creation in development

When a query needs a composite index, Firestore returns an error with a link to create it in the Firebase Console. For this project, the first `orderBy("createdAt")` query on each collection triggers auto-index creation.

### Queries that would need composite indexes (not yet implemented)

| Future query | Composite index |
|---|---|
| `where("status", "==", "active").orderBy("createdAt", "desc")` | `products: status ASC, createdAt DESC` |
| `where("category", "==", "Software").orderBy("price", "desc")` | `products: category ASC, price DESC` |
| `where("tenantId", "==", "org1").orderBy("createdAt", "desc")` | `products: tenantId ASC, createdAt DESC` |

Define these in `firestore.indexes.json` before deploying filtered/sorted queries to production.

### Example `firestore.indexes.json` (future)

```json
{
  "indexes": [
    {
      "collectionGroup": "products",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tenantId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "products",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

---

## Current scale assumptions

| Assumption | Implication |
|---|---|
| Single tenant | No `tenantId` on documents |
| < 1,000 products | Fetch-all queries acceptable |
| < 100 users | Full user list without pagination |
| Analytics on read | KPIs computed by scanning all products on each `/api/analytics` request |
| Client-side table filter/sort | All products loaded to browser once |

These assumptions hold for a demo/eval dashboard. They break down at higher scale — see evolution sections below.

---

## Evolution: multi-tenancy

If the product must serve **multiple organisations** (tenants) from one Firebase project, the schema needs tenant isolation.

### Option A — `tenantId` field (recommended first step)

Add a `tenantId` field to every document:

```
users/{uid}
  email, role, tenantId, createdAt

products/{auto-id}
  name, category, price, status, tenantId, createdBy, createdAt, updatedAt
```

**Query change:** Every read/write adds `.where("tenantId", "==", auth.tenantId)`.

| Pros | Cons |
|---|---|
| Minimal migration — add field to existing docs | Risk of cross-tenant leaks if a query forgets the filter |
| Same collection structure | Composite indexes required per query pattern |
| Easy to implement incrementally | All tenants share one collection — noisy neighbours at scale |

**Auth change:** Derive `tenantId` from user doc after `verifyToken()`. Pass it into all data access functions.

```ts
// lib/db/products.ts — future
export async function getAllProducts(tenantId: string): Promise<Product[]> {
  const snapshot = await adminDb
    .collection(COL)
    .where("tenantId", "==", tenantId)
    .orderBy("createdAt", "desc")
    .get();
  // ...
}
```

### Option B — subcollections per tenant

```
tenants/{tenantId}
  name, plan, createdAt

tenants/{tenantId}/users/{uid}
  email, role, createdAt

tenants/{tenantId}/products/{productId}
  name, category, price, status, createdBy, createdAt, updatedAt
```

| Pros | Cons |
|---|---|
| Strong isolation — path encodes tenant | Cross-tenant admin queries need collection group indexes |
| Natural security rules boundary | Larger migration from flat schema |
| Scales well per tenant | More complex data access layer |

### Option C — separate Firebase projects per tenant

Extreme isolation — each tenant gets their own Firestore database. Only viable for enterprise/regulated customers. Out of scope for most SaaS growth paths.

### Recommended migration path (A → B)

1. Add `tenantId` to existing documents (backfill script).
2. Update all queries to filter by `tenantId`.
3. Add composite indexes.
4. If a single tenant exceeds ~100K documents, migrate that tenant to subcollections.

---

## Evolution: 10× product scale

At **10× products** (e.g. 500 → 5,000, or 1,000 → 10,000), these current patterns become bottlenecks:

| Current pattern | Problem at 10× | Solution |
|---|---|---|
| `getAllProducts()` — fetch entire collection | Slower reads, larger payloads, higher Firestore read costs | Cursor-based pagination |
| Analytics scans all products on every request | O(n) per dashboard load | Pre-computed aggregates or incremental counters |
| Client-side filter/sort/paginate | Large JSON to browser, memory pressure | Server-side query params (`?status=active&sort=price&cursor=...`) |
| No caching | Repeated identical reads | Short-TTL cache (Redis / in-memory) for analytics KPIs |
| Hard delete | No history for audit/compliance | Soft delete with `deletedAt` + `where("deletedAt", "==", null)` |

### Pagination (highest priority)

Replace fetch-all with cursor pagination:

```ts
// lib/db/products.ts — future
export async function getProductsPage(
  tenantId: string,
  limit = 20,
  cursor?: FirebaseFirestore.DocumentSnapshot
): Promise<{ products: Product[]; nextCursor: string | null }> {
  let query = adminDb
    .collection(COL)
    .where("tenantId", "==", tenantId)
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (cursor) {
    query = query.startAfter(cursor);
  }

  const snapshot = await query.get();
  // return page + last doc for next cursor
}
```

API change: `GET /api/products?limit=20&cursor=abc` instead of returning the full array.

### Analytics at scale

**Option 1 — Aggregate document** (write-time denormalization):

```
analytics/summary
  totalProducts, activeCount, inactiveCount, totalRevenue, lastUpdated
```

Update counters in the same transaction as product create/update/delete. Dashboard reads one document instead of scanning thousands.

**Option 2 — Scheduled rollups** — Cloud Function or cron job recomputes aggregates every N minutes. Stale by design but cheap to read.

**Option 3 — Firestore aggregation queries** — `count()` aggregation (Firestore feature) for totals without fetching every document. Still limited for sums like revenue.

### Indexing at scale

| Query pattern | Index |
|---|---|
| Paginated list by tenant | `tenantId ASC, createdAt DESC` |
| Filter active + paginate | `tenantId ASC, status ASC, createdAt DESC` |
| Search by name prefix | Not supported natively — use Algolia, Typesense, or Firestore extension |

Full-text search across product names is **not** a Firestore strength. At 10×+ scale with search requirements, add a dedicated search index.

### Schema additions for scale

| Field | Purpose |
|---|---|
| `tenantId` | Multi-tenant isolation |
| `deletedAt` | Soft delete (nullable timestamp) |
| `searchTokens` | Array of lowercase name tokens for basic prefix search |
| `version` | Optimistic concurrency on updates |

---

## Schema evolution summary

| Trigger | Change |
|---|---|
| Multi-tenancy | Add `tenantId`; filter all queries; composite indexes |
| 10× products | Cursor pagination; server-side filter/sort |
| Dashboard performance | Aggregate doc or scheduled rollups |
| Audit requirements | Soft delete; optional `audit_logs` collection |
| Full-text search | External search service; sync on product write |
| Role granularity | `permissions[]` array or separate `roles` collection |
| Categories as entities | New `categories` collection; `products.categoryId` reference |

---

## Security model (database layer)

| Layer | Mechanism |
|---|---|
| Network | Browser never connects to Firestore |
| Application | All access via Admin SDK in Next.js API routes |
| Authorization | `verifyToken()` + role from `users` doc before any query |
| Firestore rules | Not configured — Admin SDK bypasses rules |

A production hardening step would add **Firestore Security Rules** as defence-in-depth, even if the client never talks to Firestore directly.

Example future rule (if client SDK were enabled):

```
match /products/{id} {
  allow read: if request.auth != null;
  allow write: if request.auth.token.role == "admin";
}
```

Currently unnecessary because the Admin SDK operates with full privileges server-side.

---

## Key files

| File | Responsibility |
|---|---|
| `types/index.ts` | `User`, `Product`, `Role`, `ProductStatus` types |
| `lib/db/users.ts` | Users collection data access |
| `lib/db/products.ts` | Products collection data access |
| `lib/firebase/admin.ts` | Admin SDK + `adminDb` singleton |
| `app/api/analytics/route.ts` | Ad-hoc product aggregation (reads `products` directly) |
| `lib/validations/product.ts` | Field constraints before writes |

---

## Manual verification checklist

- [ ] Firebase Console → Firestore → confirm `users` and `products` collections exist
- [ ] Register a user — `users/{uid}` document created with `role: "viewer"`
- [ ] Create a product — `products/{auto-id}` document with all required fields
- [ ] Confirm `createdBy` matches the admin's Firebase Auth uid
- [ ] Confirm `createdAt` and `updatedAt` are set on create
- [ ] Update a product — only `updatedAt` and changed fields mutate
- [ ] Delete a product — document removed from Firestore
- [ ] Firebase Console → Indexes → single-field indexes on `createdAt` for both collections

---

## Related documentation

- [Step 1 · Authentication & Authorization](./01-authentication-and-authorization.md) — how `users.role` drives access control
- [Step 2 · Product CRUD](./02-product-crud.md) — product write operations and validation
- [Step 3 · Dashboard & Data Display](./03-dashboard-and-data-display.md) — how product data is aggregated for KPIs
