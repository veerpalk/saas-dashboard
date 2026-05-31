# Search & Pagination

> **Requirement:** Server-side or client-side pagination with a search bar. Bonus points for a Firestore cursor-based pagination approach.

This document describes how search and pagination are implemented on the product list, the data flow end-to-end, and how the schema would evolve toward Firestore cursor pagination.

---

## Overview

| Concern | Implementation | Location |
|---|---|---|
| Search bar | Client-side global filter | `/dashboard/products` |
| Status filter | Client-side column filter | `/dashboard/products` |
| Sorting | Client-side column sort | `/dashboard/products` |
| Pagination | Client-side, 10 rows/page | `/dashboard/products` |
| Data fetch | Single request — all products | `GET /api/products` |
| Server-side pagination | Not implemented | — |
| Firestore cursor pagination | Not implemented (documented as evolution path) | — |

**Approach chosen:** **client-side** search, filter, sort, and pagination via **TanStack Table v8**, backed by a one-time fetch of the full product list.

This satisfies the base requirement. The **bonus** Firestore cursor approach is described in [Evolution: cursor-based pagination](#evolution-cursor-based-pagination) for future implementation.

---

## What the requirement means

| Ask | Meaning |
|---|---|
| **Search bar** | Users can narrow the product list by typing — typically matches name, category, or other visible fields |
| **Pagination** | Long lists are split into pages instead of rendering every row at once |
| **Server-side or client-side** | Either approach is acceptable — server paginates in the database/API; client paginates in memory after fetching data |
| **Bonus: Firestore cursor pagination** | Use Firestore's `startAfter()` with document snapshots instead of offset/limit — efficient for large collections |

---

## Architecture (current)

```
┌─────────────────────────────────────────────────────────────────┐
│  /dashboard/products                                             │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────────┐  │
│  │ Search input │   │ Status filter│   │ Sortable columns    │  │
│  │ globalFilter │   │ columnFilters│   │ sorting state       │  │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬──────────┘  │
│         │                  │                      │             │
│         └──────────────────┴──────────────────────┘             │
│                            │                                     │
│                   TanStack Table                                 │
│         getFilteredRowModel → getSortedRowModel                  │
│                            → getPaginationRowModel (pageSize: 10)│
└────────────────────────────┬────────────────────────────────────┘
                             │ mount: one fetch
                             ▼
              GET /api/products  →  getAllProducts()
                             │
                             ▼
              Firestore: products.orderBy("createdAt", "desc").get()
                             │
                             ▼
              Returns entire collection as JSON array
```

All filtering, sorting, and paging happen **after** the full array is in browser memory. No query params are sent on subsequent search or page changes.

---

## Data loading

On mount, the page fetches every product in one API call:

```tsx
// app/dashboard/products/page.tsx
const fetchProducts = useCallback(async () => {
  const token = await getToken();
  const res = await fetch("/api/products", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  setProducts(data.products);  // full array stored in React state
}, [getToken]);
```

API and data layer:

```ts
// app/api/products/route.ts — no search/pagination query params
const products = await getAllProducts();
return Response.json({ products });

// lib/db/products.ts
export async function getAllProducts(): Promise<Product[]> {
  const snapshot = await adminDb
    .collection("products")
    .orderBy("createdAt", "desc")
    .get();  // no .limit(), no .startAfter()
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Product[];
}
```

| Property | Value |
|---|---|
| API calls per session | 1 (on mount; +1 after delete updates local state) |
| Firestore reads | 1 read per product document |
| Network payload | Full product array every load |

---

## Search

### Global search bar

A text input with a search icon filters across **all column values**:

```tsx
<input
  type="text"
  placeholder="Search products…"
  value={globalFilter}
  onChange={(e) => setGlobalFilter(e.target.value)}
/>
```

Wired to TanStack Table:

```tsx
state: { globalFilter },
onGlobalFilterChange: setGlobalFilter,
getFilteredRowModel: getFilteredRowModel(),
```

**Behaviour:**
- Filters run **instantly** on every keystroke — no debounce, no API call
- Matches any cell value (name, category, price, status) using TanStack's default string filter
- Case sensitivity follows TanStack defaults (typically case-insensitive substring match)
- Composes with the status filter — both apply together

### Status filter

A dropdown applies an exact match on the `status` column:

| Option | Effect |
|---|---|
| All statuses | Clears status filter |
| Active | Only `status === "active"` |
| Inactive | Only `status === "inactive"` |

```tsx
function setStatusFilter(val: string) {
  setColumnFilters((prev) => {
    const others = prev.filter((f) => f.id !== "status");
    return val ? [...others, { id: "status", value: val }] : others;
  });
}
```

The `status` column uses `filterFn: "equals"` for exact matching.

### Empty search results

When filters exclude all rows:

```
No products found.
```

Distinct from the initial empty catalogue state (which shows "Create your first product" for admins).

---

## Sorting

Click any sortable column header (Name, Category, Price, Status) to cycle:

**unsorted → ascending → descending → unsorted**

```tsx
getSortedRowModel: getSortedRowModel(),
onSortingChange: setSorting,
```

Sort applies to the **filtered** row set — search/filter first, then sort, then paginate.

---

## Pagination

### Configuration

```tsx
getPaginationRowModel: getPaginationRowModel(),
initialState: { pagination: { pageSize: 10 } },
```

| Setting | Value |
|---|---|
| Page size | 10 rows |
| Controls | Previous / Next buttons |
| Page indicator | "Page X of Y" |
| Visibility | Hidden when `pageCount <= 1` |

### UI

```tsx
{!loading && table.getPageCount() > 1 && (
  <div className="flex items-center justify-between">
    <span>Page {pageIndex + 1} of {pageCount}</span>
    <button onClick={() => table.previousPage()} disabled={!canPreviousPage}>
      Previous
    </button>
    <button onClick={() => table.nextPage()} disabled={!canNextPage}>
      Next
    </button>
  </div>
)}
```

### Processing order

TanStack applies models in this sequence:

```
all products (from API)
  → filter (globalFilter + columnFilters)
  → sort (sorting state)
  → paginate (pageIndex × pageSize)
  → render visible rows
```

Changing search or filter **resets to page 1** automatically (TanStack default when filtered row count changes).

### Header count

The page header shows **total loaded products**, not filtered count:

```tsx
{products.length} product{products.length !== 1 ? "s" : ""} total
```

This reflects the full dataset size from the API, not the current filter result.

---

## TanStack Table configuration reference

```tsx
const table = useReactTable({
  data: products,
  columns,
  state: { sorting, columnFilters, globalFilter },
  onSortingChange: setSorting,
  onColumnFiltersChange: setColumnFilters,
  onGlobalFilterChange: setGlobalFilter,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
  initialState: { pagination: { pageSize: 10 } },
});
```

| Model | Purpose |
|---|---|
| `getCoreRowModel` | Base row data |
| `getFilteredRowModel` | Search + status filter |
| `getSortedRowModel` | Column sort |
| `getPaginationRowModel` | Page slicing |

---

## Requirement coverage

| Requirement | Status | Notes |
|---|---|---|
| Search bar | ✓ | Global text search on product list |
| Pagination | ✓ | Client-side, 10 per page |
| Server-side **or** client-side | ✓ | Client-side chosen |
| Bonus: Firestore cursor pagination | ✗ | Not implemented — see evolution section |

---

## Client-side vs server-side trade-offs

### Why client-side was chosen

| Advantage | Explanation |
|---|---|
| **Instant UX** | Search, filter, sort, and page changes with zero latency |
| **Simple API** | `GET /api/products` returns one array — no query param contract |
| **TanStack built-ins** | Filter, sort, paginate models work out of the box |
| **Small catalogue assumption** | Demo/eval dashboard with tens to low hundreds of products |

### Limitations at scale

| Problem | Threshold |
|---|---|
| Large initial payload | Painful beyond ~1,000 products |
| Firestore read cost | 1 read per document on every page load |
| Browser memory | Full array held in React state |
| Search quality | Substring match only — no full-text search |
| Stale data | No refetch on search/page change — only on mount |

---

## Evolution: cursor-based pagination

The **bonus** approach uses Firestore **cursor pagination** with `startAfter()` instead of fetching all documents or using offset-based `skip`.

### Why cursors over offset?

| Approach | Firestore support | Problem |
|---|---|---|
| `OFFSET / skip` | Not native | Firestore has no `OFFSET` — emulating it reads and discards docs (expensive) |
| **Cursor (`startAfter`)** | Native | Reads only the next page; consistent under concurrent writes |
| Client-side | N/A | Reads everything upfront |

### Proposed API contract

```
GET /api/products?limit=10
GET /api/products?limit=10&cursor=<lastDocId>
GET /api/products?limit=10&status=active&cursor=<lastDocId>
```

**Response:**

```json
{
  "products": [ /* up to 10 items */ ],
  "nextCursor": "abc123docId",
  "hasMore": true
}
```

When `hasMore` is false, omit or null `nextCursor`.

### Proposed data access layer

```ts
// lib/db/products.ts — future implementation
export async function getProductsPage(options: {
  limit?: number;
  cursor?: string;
  status?: "active" | "inactive";
}): Promise<{
  products: Product[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = options.limit ?? 10;

  let query: FirebaseFirestore.Query = adminDb
    .collection("products")
    .orderBy("createdAt", "desc");

  if (options.status) {
    query = query.where("status", "==", options.status);
  }

  if (options.cursor) {
    const cursorDoc = await adminDb.collection("products").doc(options.cursor).get();
    if (cursorDoc.exists) {
      query = query.startAfter(cursorDoc);
    }
  }

  // Fetch one extra to detect hasMore
  const snapshot = await query.limit(limit + 1).get();
  const hasMore = snapshot.docs.length > limit;
  const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;

  const products = docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Product[];
  const nextCursor = hasMore ? docs[docs.length - 1].id : null;

  return { products, nextCursor, hasMore };
}
```

### Index requirements for filtered cursor queries

| Query | Composite index |
|---|---|
| `orderBy("createdAt", "desc").limit(n)` | Single-field on `createdAt` (auto) |
| `where("status", "==", "active").orderBy("createdAt", "desc")` | `status ASC, createdAt DESC` |

Define in `firestore.indexes.json` before deploying.

### Proposed UI changes

Replace TanStack client pagination with server-driven state:

```tsx
const [products, setProducts] = useState<Product[]>([]);
const [cursor, setCursor] = useState<string | null>(null);
const [cursorStack, setCursorStack] = useState<string[]>([]); // for Previous
const [hasMore, setHasMore] = useState(false);

async function fetchPage(nextCursor?: string) {
  const params = new URLSearchParams({ limit: "10" });
  if (nextCursor) params.set("cursor", nextCursor);
  if (statusFilter) params.set("status", statusFilter);
  if (search) params.set("search", search); // see search note below

  const res = await fetch(`/api/products?${params}`, { headers: { … } });
  const data = await res.json();
  setProducts(data.products);
  setCursor(data.nextCursor);
  setHasMore(data.hasMore);
}
```

**Previous page:** Maintain a stack of cursors, or use `startAt` / `endBefore` for bidirectional navigation.

### Search with server-side pagination

Firestore does **not** support full-text search natively. Options:

| Approach | Complexity | Quality |
|---|---|---|
| Client filter on fetched page only | Low | Poor — misses matches on other pages |
| Prefix query on `name` field | Medium | `where("name", ">=", q).where("name", "<=", q + "\uf8ff")` |
| `searchTokens` array field | Medium | Token array updated on write |
| Algolia / Typesense / Firebase Extension | High | Production-grade full-text |

For the bonus, **status filter + cursor pagination** is the natural first step; **search** is a separate enhancement.

### Migration path

```
Phase 1 (current)     Client-side everything, fetch-all API
Phase 2               Add getProductsPage() + cursor API; keep client search on page
Phase 3               Server status filter + cursor; debounced server search
Phase 4               External search index for full-text
```

---

## Comparison summary

| Feature | Current (client) | Bonus (Firestore cursor) |
|---|---|---|
| Initial load | All products | First 10 products |
| Page change | Instant (memory) | API call with cursor |
| Search | Instant substring | Requires search strategy |
| Firestore reads | N (all docs) | 10–11 per page |
| API complexity | Minimal | Query params + cursor handling |
| Scale limit | ~ hundreds | Thousands+ |

---

## Key files

| File | Role in search & pagination |
|---|---|
| `app/dashboard/products/page.tsx` | Search input, status filter, TanStack Table, pagination UI |
| `app/api/products/route.ts` | `GET` — returns full product array (no pagination params) |
| `lib/db/products.ts` | `getAllProducts()` — fetch-all Firestore query |
| `@tanstack/react-table` | Client filter, sort, paginate models |

---

## End-to-end flows

### User searches for a product

```
1. Page already loaded — products[] in memory
2. User types "Analytics" in search bar
3. globalFilter updates → getFilteredRowModel re-runs
4. Table shows matching rows instantly — no API call
5. Pagination recalculates — may show fewer pages
```

### User paginates through results

```
1. User clicks "Next"
2. table.nextPage() → pageIndex increments
3. getPaginationRowModel slices rows [10..19]
4. Table re-renders — no API call
```

### User filters by active status and sorts by price

```
1. Status dropdown → "Active" → columnFilters updated
2. getFilteredRowModel → only active products
3. Click "Price" header → sorting = [{ id: "price", desc: false }]
4. getSortedRowModel → filtered + sorted
5. getPaginationRowModel → first 10 of result set
```

### User loads page with 25 products

```
1. GET /api/products → 25 documents from Firestore
2. Table shows rows 1–10
3. Pagination: "Page 1 of 3"
4. Next → rows 11–20; Next → rows 21–25
```

---

## Manual verification checklist

### Search

- [ ] Open `/dashboard/products` with several products loaded
- [ ] Type a product name in the search bar — list narrows immediately
- [ ] Clear search — full list returns
- [ ] Search for text that matches no product — "No products found."
- [ ] Apply status filter + search together — both filters apply

### Sort

- [ ] Click "Name" header — rows sort A→Z; click again Z→A
- [ ] Sort by Price — numeric order correct
- [ ] Sort after filtering — sort applies to filtered subset only

### Pagination

- [ ] With ≤10 products — no pagination controls shown
- [ ] With >10 products — "Page 1 of N" and Previous/Next appear
- [ ] Previous disabled on page 1; Next disabled on last page
- [ ] Filter/search that reduces results to ≤10 — pagination hides

### API (confirms client-side model)

- [ ] Network tab: only one `GET /api/products` on page load
- [ ] Typing in search bar — no additional network requests
- [ ] Clicking Next — no additional network requests

---

## Related documentation

- [Step 2 · Product CRUD](./02-product-crud.md) — product list page and API
- [Step 3 · Dashboard & Data Display](./03-dashboard-and-data-display.md) — filtering/sorting in dashboard context
- [Step 4 · Database Design](./04-database-design.md) — scale evolution and cursor pagination schema notes
