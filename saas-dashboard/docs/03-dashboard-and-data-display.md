# Step 3 · Dashboard & Data Display

> **Requirement:** A responsive dashboard page showing a product list with filtering / sorting, plus at least two summary metrics (e.g. total products, active count, revenue total). Focus on clean, usable UI — not visual polish for its own sake.

This document describes how the dashboard overview and product data display are implemented in this project.

---

## Overview

| Concern | Implementation |
|---|---|
| Dashboard overview | `/dashboard` — KPI cards + charts |
| Product list | `/dashboard/products` — TanStack Table |
| Summary metrics | 4 KPIs via `GET /api/analytics` |
| Filtering | Global search + status dropdown on product list |
| Sorting | Clickable column headers on product list |
| Pagination | 10 rows per page on product list |
| Layout | Sidebar + scrollable main area (`dashboard/layout.tsx`) |
| Charts | Recharts (bar, pie, line) — supplementary to KPIs |

Step 3 splits across **two pages** under a shared dashboard shell: an **analytics overview** for at-a-glance metrics, and a **products list** for browsing and managing the catalogue with filter/sort controls.

---

## What the requirement means

| Ask | Meaning |
|---|---|
| **Responsive dashboard page** | Layout adapts to screen size — usable on desktop and smaller viewports without horizontal overflow or broken grids |
| **Product list with filtering / sorting** | Users can narrow results (search, status) and reorder rows (column sort) without leaving the page |
| **At least two summary metrics** | Aggregate numbers computed from product data — e.g. total count, active count, revenue |
| **Clean, usable UI** | Clear hierarchy, readable typography, sensible spacing, loading/error states — utility over decoration |

The requirement does **not** demand fancy animations, custom illustrations, or a design system. It asks for something a real user can scan and act on quickly.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Dashboard shell — app/dashboard/layout.tsx                         │
│  ┌──────────────┐  ┌────────────────────────────────────────────┐  │
│  │   Sidebar    │  │  Main content (page-specific)              │  │
│  │   (fixed     │  │                                            │  │
│  │    256px)    │  │  /dashboard        → KPIs + charts         │  │
│  │              │  │  /dashboard/products → table + filters     │  │
│  └──────────────┘  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         │                              │
         │                              ├── GET /api/analytics  (overview)
         │                              └── GET /api/products   (list)
         │
    ProtectedRoute + AuthContext
```

Data flow:

```
Browser page mount
  → getToken() from AuthContext
  → fetch API with Authorization: Bearer <token>
  → render loading spinner → data or error state
```

---

## Dashboard shell (shared layout)

All dashboard pages share `app/dashboard/layout.tsx`:

```tsx
<ProtectedRoute>
  <div className="flex min-h-screen bg-slate-50">
    <Sidebar />                    {/* fixed 256px nav */}
    <main className="flex-1 overflow-auto">
      {children}                   {/* page content scrolls independently */}
    </main>
  </div>
</ProtectedRoute>
```

### Responsive behaviour

| Element | Desktop | Smaller screens |
|---|---|---|
| Shell | Sidebar + main side-by-side | Same flex layout; main scrolls horizontally if needed |
| KPI grid | 4 columns (`lg:grid-cols-4`) | 2 columns (`grid-cols-2`) |
| Chart grid | 2 columns side-by-side | 1 column stacked (`grid-cols-1`) |
| Product table | Full width in main | Horizontal scroll within table container if columns overflow |
| Sidebar | Fixed 256px (`w-64 shrink-0`) | Does not collapse to hamburger — acceptable for admin dashboard scope |

The layout prioritises **readability and navigation** over mobile-first collapsible nav. Content areas use Tailwind responsive grids rather than fixed pixel widths.

---

## Page 1 — Analytics overview (`/dashboard`)

The main dashboard page answers: *"How is my product catalogue doing?"*

### Summary metrics (KPIs)

The requirement asks for **at least two** metrics. This project exposes **four** via `StatCard` components:

| Metric | Source | Display |
|---|---|---|
| **Total Products** | `products.length` | Integer count |
| **Active** | `status === "active"` count | Integer + `% of total` subtitle |
| **Inactive** | `total - active` | Integer count |
| **Revenue (active)** | Sum of `price` for active products | USD formatted (`$1,234.56`) |

```tsx
// app/dashboard/page.tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <StatCard label="Total Products" value={kpis.total} accent="blue" />
  <StatCard label="Active" value={kpis.active} sub="…% of total" accent="green" />
  <StatCard label="Inactive" value={kpis.inactive} accent="red" />
  <StatCard label="Revenue (active)" value={`$${…}`} accent="purple" />
</div>
```

`StatCard` (`app/components/StatCard.tsx`) is a minimal reusable card: label, large value, optional subtitle, colour accent. No icons or sparklines — keeps focus on the number.

### Charts (supplementary visualisation)

Beyond the required metrics, three Recharts visualisations help users spot patterns:

| Chart | Type | Data | Empty state |
|---|---|---|---|
| Products by Category | Bar chart | Count per category | "No data yet" |
| Status Breakdown | Donut pie | Active vs inactive | Hidden when total = 0 |
| Products Created — Last 30 Days | Line chart | Daily creation count | Always renders (pre-filled zeros) |

Charts use `ResponsiveContainer` so they resize with their parent. Tooltips and legends use small, readable font sizes (11–12px).

### Loading and error states

| State | UI |
|---|---|
| Loading | Centred spinner + "Loading analytics…" |
| Error | Red error message (failed fetch or no data) |
| Empty charts | `EmptyChart` placeholder at fixed 220px height |

---

## Page 2 — Product list (`/dashboard/products`)

The product list satisfies the **filtering / sorting** part of the requirement. It is a separate page linked from the sidebar, not embedded on the overview — clearer separation between *summary* and *detail*.

Built with **TanStack Table v8** (`@tanstack/react-table`).

### Columns

| Column | Sortable | Notes |
|---|---|---|
| Name | ✓ | Bold primary text |
| Category | ✓ | Pill badge |
| Price | ✓ | Monospace, `$XX.XX` |
| Status | ✓ | Green (active) / red (inactive) pill |
| Actions | ✗ | Edit + Delete (admin only) |

### Filtering

Two filter controls above the table:

**1. Global search** — filters across all columns client-side:

```tsx
<input
  placeholder="Search products…"
  value={globalFilter}
  onChange={(e) => setGlobalFilter(e.target.value)}
/>
```

TanStack's `getFilteredRowModel()` applies the search string to every cell value.

**2. Status filter** — dropdown with exact match on the `status` column:

| Option | Effect |
|---|---|
| All statuses | No status filter |
| Active | Only `status === "active"` |
| Inactive | Only `status === "inactive"` |

Filters compose: search + status apply together.

### Sorting

Click any sortable column header to cycle: **unsorted → ascending → descending**.

```tsx
onClick={header.column.getToggleSortingHandler()}
```

Visual indicator via `SortIcon`: neutral chevrons, up arrow, or down arrow.

Sorting is **client-side** — all products are fetched once, then sorted in memory. Suitable for small-to-medium catalogues.

### Pagination

- Default page size: **10 rows**
- Previous / Next buttons at the bottom
- Shows "Page X of Y" — hidden when only one page

### Empty and loading states

| State | UI |
|---|---|
| Loading | Centred spinner inside table card |
| No products | "No products found." + admin link to create first product |
| No filter matches | Same empty message (filtered result set is empty) |

### Admin vs viewer display

| Feature | Viewer | Admin |
|---|---|---|
| View list, search, sort, paginate | ✓ | ✓ |
| "New Product" button | Hidden | Visible |
| Edit / Delete row actions | Hidden | Visible |

---

## Analytics API

Aggregated dashboard data is served by a dedicated endpoint rather than computing KPIs in the browser from the raw product list.

### `GET /api/analytics`

**Auth:** Any authenticated user (`verifyToken` — no admin required).

**Response shape:**

```json
{
  "kpis": {
    "total": 42,
    "active": 35,
    "inactive": 7,
    "totalCategories": 6,
    "totalRevenue": 12499.50
  },
  "byCategory": [
    { "category": "Software", "count": 12 },
    { "category": "Analytics", "count": 8 }
  ],
  "statusBreakdown": [
    { "name": "Active", "value": 35 },
    { "name": "Inactive", "value": 7 }
  ],
  "dailyCreations": [
    { "date": "2026-05-01", "count": 2 },
    { "date": "2026-05-02", "count": 0 }
  ]
}
```

### Metric calculations (`app/api/analytics/route.ts`)

All metrics are computed server-side from a single Firestore query:

```ts
adminDb.collection("products").orderBy("createdAt", "asc").get()
```

| Metric | Algorithm |
|---|---|
| `total` | `products.length` |
| `active` | Count where `status === "active"` |
| `inactive` | `total - active` |
| `totalCategories` | `new Set(products.map(p => p.category)).size` |
| `totalRevenue` | Sum of `price` for active products only |
| `byCategory` | Group by `category`, count each |
| `statusBreakdown` | `[{ Active, active }, { Inactive, inactive }]` |
| `dailyCreations` | Pre-fill last 30 days with 0, increment by `createdAt` date |

**Revenue definition:** Sum of list prices for **active** products only. Inactive products are excluded — they represent catalogue entries not currently generating revenue.

**Daily creations:** Last 30 calendar days, keyed as `YYYY-MM-DD`. Days with no creations show `count: 0` so the line chart has a continuous x-axis.

### Why a separate analytics endpoint?

| Approach | Pros | Cons |
|---|---|---|
| **Dedicated `/api/analytics`** (this project) | Single request for dashboard; server-side aggregation; UI stays thin | Duplicates a Firestore read alongside `/api/products` |
| Client-side from product list | One API call reused | Heavy payload; KPI logic in browser; slower initial dashboard |

For a dashboard overview, server-side aggregation keeps the page fast and the client simple.

---

## UI design principles

The requirement emphasises **usable over polished**. Decisions reflect that:

| Principle | How it's applied |
|---|---|
| **Clear hierarchy** | Page title → KPI row → charts → (separate page) table |
| **Consistent spacing** | `p-8`, `space-y-6/8`, `gap-4` throughout dashboard pages |
| **Readable data** | Monospace prices, colour-coded status pills, uppercase KPI labels |
| **Minimal chrome** | White cards with `border-slate-200`, no shadows except subtle form containers |
| **Actionable empty states** | "Create your first product" link for admins, not just "No data" |
| **Feedback** | Loading spinners, toast notifications on CRUD actions (via `react-hot-toast`) |
| **No decoration for its own sake** | StatCards have no icons; charts use two accent colours; sidebar is functional dark nav |

Colour is used **semantically**: green = active/positive, red = inactive/destructive, blue = primary actions, purple = revenue.

---

## End-to-end flows

### User opens dashboard overview

```
1. Navigate to /dashboard (or redirected from /)
2. ProtectedRoute confirms auth → render layout + page
3. GET /api/analytics with Bearer token
4. Loading spinner → KPI cards + charts render
5. Empty catalogue → KPIs show 0, charts show "No data yet"
```

### User browses and filters products

```
1. Sidebar → Products → /dashboard/products
2. GET /api/products → populate TanStack Table
3. Type in search box → globalFilter narrows rows instantly
4. Select "Active" status → column filter applied
5. Click "Price" header → sort ascending by price
6. Click "Next" → page 2 of results
```

### Admin creates product, dashboard updates

```
1. Admin creates product on /dashboard/products/new
2. Returns to product list — new row visible
3. Navigate to /dashboard — KPI total +1, charts refresh on next mount
   (no real-time subscription — refetch on page load)
```

---

## Key files

| File | Responsibility |
|---|---|
| `app/dashboard/layout.tsx` | Shared shell: sidebar, main, auth guard, toasts |
| `app/dashboard/page.tsx` | Analytics overview — KPIs + Recharts |
| `app/dashboard/products/page.tsx` | Product list — TanStack Table, filters, sort, pagination |
| `app/components/StatCard.tsx` | Reusable KPI metric card |
| `app/components/Sidebar.tsx` | Navigation between dashboard pages |
| `app/components/ProtectedRoute.tsx` | Redirect unauthenticated users |
| `app/api/analytics/route.ts` | Server-side KPI and chart aggregation |
| `app/api/products/route.ts` | Product list data for table |

---

## TanStack Table configuration

The product list wires these TanStack features:

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

| Feature | Hook / model |
|---|---|
| Row data | `getCoreRowModel` |
| Column sort | `getSortedRowModel` + `SortingState` |
| Global + column filter | `getFilteredRowModel` + `ColumnFiltersState` + `globalFilter` |
| Pagination | `getPaginationRowModel` + `pageSize: 10` |

All table state is **client-side** — no server-side pagination or sort params. Appropriate for catalogues that fit in memory.

---

## Requirement coverage matrix

| Requirement | Status | Where |
|---|---|---|
| Responsive dashboard page | ✓ | `layout.tsx`, responsive Tailwind grids |
| Product list | ✓ | `/dashboard/products` |
| Filtering | ✓ | Global search + status dropdown |
| Sorting | ✓ | Clickable column headers |
| ≥ 2 summary metrics | ✓ | 4 KPIs: total, active, inactive, revenue |
| Clean, usable UI | ✓ | StatCard, table, loading/error/empty states |
| Not polish for its own sake | ✓ | Functional components, semantic colour, no decorative assets |

---

## Trade-offs & scope decisions

| Decision | Rationale |
|---|---|
| **Two pages** (overview + list) | Overview for metrics; list for browse/filter — avoids one overcrowded page |
| **Client-side filter/sort/paginate** | Simple, instant UX; fine for small catalogues |
| **Fetch-all products for analytics and list** | No Firestore aggregation queries; acceptable at this scale |
| **No real-time updates** | Data fetched on mount; simpler than `onSnapshot` listeners |
| **Charts beyond requirement** | Bar/pie/line aid comprehension; KPI cards satisfy the minimum |
| **Revenue = sum of active prices** | Simple catalogue metric; not actual sales/transactions |
| **Sidebar doesn't collapse on mobile** | Admin tool assumption; main content still scrolls |

---

## Manual verification checklist

- [ ] Sign in and land on `/dashboard` — KPI cards load
- [ ] With no products — all KPIs show 0, charts show empty states
- [ ] Create several products (mix of active/inactive, categories, prices)
- [ ] Refresh `/dashboard` — totals, active count, revenue match expectations
- [ ] Bar chart reflects category counts; pie chart shows active/inactive split
- [ ] Line chart shows creation dates for recently added products
- [ ] Resize browser — KPI grid goes 4-col → 2-col; charts stack vertically
- [ ] Open `/dashboard/products` — all products listed
- [ ] Global search — type a product name, list narrows
- [ ] Status filter — select "Active", only active products shown
- [ ] Click column header — rows reorder; icon indicates sort direction
- [ ] With >10 products — pagination appears, Next/Previous work
- [ ] Sign in as viewer — list and dashboard work; no admin-only actions visible

---

## Related documentation

- [Step 1 · Authentication & Authorization](./01-authentication-and-authorization.md) — protects dashboard pages and API endpoints
- [Step 2 · Product CRUD](./02-product-crud.md) — product data source for metrics and list
