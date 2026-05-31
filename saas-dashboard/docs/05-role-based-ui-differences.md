# Role-Based UI Differences

> **Requirement:** Admin sees edit/delete controls; viewer sees a read-only interface. Enforce on the server side too — don't rely only on hiding UI elements.

This document describes how admin and viewer experiences differ in the UI, how server-side enforcement backs every permission boundary, and why hiding buttons alone is not security.

---

## Overview

| Layer | Purpose | Trust level |
|---|---|---|
| **UI (client)** | Show or hide controls based on `role` from `AuthContext` | UX only — can be bypassed |
| **API (server)** | `verifyToken()` + `requireAdmin()` on every mutating endpoint | Authoritative — cannot be bypassed |

The core rule: **the UI is a convenience layer; the API is the security layer.**

A viewer who opens DevTools, edits the DOM, or calls `fetch()` directly must still be blocked from creating, updating, or deleting data.

---

## Roles

| Role | Interface | Mutations |
|---|---|---|
| **admin** | Full dashboard — create, edit, delete products; manage users | Allowed (server-verified) |
| **viewer** | Read-only dashboard — browse products and analytics | Blocked at API (403) |

Role is loaded once per session from Firestore via `GET /api/auth/me` and stored in React context:

```tsx
// app/context/AuthContext.tsx
const [role, setRole] = useState<"admin" | "viewer" | null>(null);

// After Firebase auth state resolves:
const res = await fetch("/api/auth/me", {
  headers: { Authorization: `Bearer ${token}` },
});
setRole(data.role);
```

Components read role with `useAuth()`:

```tsx
const { role } = useAuth();
const isAdmin = role === "admin";
```

Role is **never** accepted from client request bodies or query params — always read server-side from Firestore during token verification.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Viewer / Admin browser                                          │
│                                                                  │
│  AuthContext.role ──▶ conditional UI rendering                   │
│       │                    (hide buttons, nav, pages)            │
│       │                                                          │
│       └──▶ fetch("/api/…") + Authorization: Bearer <token>      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  Server — lib/auth/middleware.ts                                 │
│                                                                  │
│  verifyToken(req)                                                │
│    1. Verify Firebase ID token                                   │
│    2. Load role from Firestore users/{uid}                       │
│    → { uid, role }                                               │
│                                                                  │
│  requireAdmin(role)   ← called on every write / admin-only read  │
│    role !== "admin" → 403 Forbidden                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## UI differences by surface

### Sidebar navigation

**File:** `app/components/Sidebar.tsx`

| Element | Admin | Viewer |
|---|---|---|
| Dashboard link | ✓ | ✓ |
| Products link | ✓ | ✓ |
| Users link (Admin section) | ✓ | Hidden |
| Role badge in footer | Shows `admin` | Shows `viewer` |

```tsx
{role === "admin" && (
  <>
    <div className="px-3 pt-4 pb-1">
      <p className="text-xs …">Admin</p>
    </div>
    {adminNavItems.map((item) => (
      <NavLink key={item.href} item={item} … />
    ))}
  </>
)}
```

Viewers never see the Users nav item. They can still type `/dashboard/users` in the URL — handled by page-level guard (below).

---

### Products list — `/dashboard/products`

**File:** `app/dashboard/products/page.tsx`

| Element | Admin | Viewer |
|---|---|---|
| Product table (read) | ✓ | ✓ |
| Search, sort, pagination | ✓ | ✓ |
| **New Product** button | ✓ | Hidden |
| **Edit** row action | ✓ | Hidden |
| **Delete** row action | ✓ | Hidden |
| Empty state "Create your first product" link | ✓ | Hidden |

```tsx
const isAdmin = role === "admin";

// Actions column — entire cell is null for viewers
cell: ({ row }) =>
  isAdmin ? (
    <div>
      <Link href={`/dashboard/products/${row.original.id}/edit`}>…</Link>
      <button onClick={() => handleDelete(…)}>…</button>
    </div>
  ) : null,
```

Viewers get a **read-only table** — same data, no mutation affordances.

---

### Product create / edit pages

**Files:** `app/dashboard/products/new/page.tsx`, `app/dashboard/products/[id]/edit/page.tsx`

| Page | Admin | Viewer |
|---|---|---|
| `/dashboard/products/new` | Form accessible (via button or URL) | No nav link; form visible if URL typed directly |
| `/dashboard/products/[id]/edit` | Form pre-filled, save works | No nav link; form visible if URL typed directly |

**Note:** Create/edit pages do **not** redirect non-admins client-side. A viewer who navigates directly sees the form but **submit fails with 403** from the API. Server enforcement still holds; the UX gap is showing a form that cannot succeed.

ProductForm always calls the API — it does not check role before submit:

```tsx
const res = await fetch(url, {
  method: isEdit ? "PUT" : "POST",
  headers: { Authorization: `Bearer ${token}`, … },
  body: JSON.stringify(parsed.data),
});
// Viewer receives 403 → toast.error("Admin access required")
```

---

### Users page — `/dashboard/users`

**File:** `app/dashboard/users/page.tsx`

Admin-only page with **three** client-side guards:

| Guard | Mechanism |
|---|---|
| Redirect | `useEffect` → `router.replace("/dashboard")` if `role !== "admin"` |
| Conditional fetch | `GET /api/users` only when `currentRole === "admin"` |
| Render gate | `if (currentRole !== "admin") return null` |

```tsx
useEffect(() => {
  if (currentRole && currentRole !== "admin") {
    router.replace("/dashboard");
  }
}, [currentRole, router]);
```

Admin sees a user table with **Promote / Demote** toggle buttons. Viewers are redirected before the page renders.

---

### Dashboard overview — `/dashboard`

**File:** `app/dashboard/page.tsx`

| Element | Admin | Viewer |
|---|---|---|
| KPI cards | ✓ | ✓ |
| Charts | ✓ | ✓ |

No role-based UI differences — analytics are read-only for all authenticated users.

---

## Complete UI permission matrix

| Surface | Viewer | Admin |
|---|---|---|
| `/dashboard` | Read | Read |
| `/dashboard/products` | Read (table, filter, sort) | Read + New / Edit / Delete |
| `/dashboard/products/new` | No nav link* | Create form |
| `/dashboard/products/:id/edit` | No nav link* | Edit form |
| `/dashboard/users` | Redirected to `/dashboard` | User list + role toggles |
| Sidebar Users link | Hidden | Visible |

\*URL directly accessible; API blocks submission for viewers.

---

## Server-side enforcement

Every API route follows the same pattern:

```ts
const auth = await verifyToken(req);
if ("error" in auth) {
  return Response.json({ error: auth.error }, { status: auth.status }); // 401
}

const adminCheck = requireAdmin(auth.role);  // only on protected operations
if (adminCheck) {
  return Response.json({ error: adminCheck.error }, { status: adminCheck.status }); // 403
}
```

### `verifyToken()` — who are you?

```ts
// lib/auth/middleware.ts
const decoded = await adminAuth.verifyIdToken(token);
const userData = await getUser(decoded.uid);
return {
  uid: decoded.uid,
  role: (userData?.role ?? "viewer") as "admin" | "viewer",
};
```

- Token verified cryptographically — cannot be forged
- Role read from **Firestore**, not from the JWT or request body
- Missing/invalid token → **401 Unauthorized**
- Defaults to `"viewer"` if user doc missing (fail-safe toward least privilege)

### `requireAdmin()` — are you allowed?

```ts
export function requireAdmin(role: string) {
  if (role !== "admin") {
    return { error: "Admin access required", status: 403 };
  }
  return null;
}
```

Non-admin → **403 Forbidden**. The operation never reaches Firestore.

---

## API permission matrix

| Endpoint | Method | Viewer | Admin | Server check |
|---|---|---|---|---|
| `/api/auth/me` | GET | ✓ | ✓ | `verifyToken` only |
| `/api/products` | GET | ✓ | ✓ | `verifyToken` only |
| `/api/products/:id` | GET | ✓ | ✓ | `verifyToken` only |
| `/api/analytics` | GET | ✓ | ✓ | `verifyToken` only |
| `/api/products` | POST | ✗ 403 | ✓ | `verifyToken` + `requireAdmin` |
| `/api/products/:id` | PUT | ✗ 403 | ✓ | `verifyToken` + `requireAdmin` |
| `/api/products/:id` | DELETE | ✗ 403 | ✓ | `verifyToken` + `requireAdmin` |
| `/api/users` | GET | ✗ 403 | ✓ | `verifyToken` + `requireAdmin` |
| `/api/users/:id` | PATCH | ✗ 403 | ✓ | `verifyToken` + `requireAdmin` |

**Read operations** require authentication only. **Write operations** require admin.

---

## Why UI hiding is not enough

A determined user can bypass the UI entirely:

| Bypass attempt | UI alone | UI + server enforcement |
|---|---|---|
| Remove `display:none` from Edit button | Button appears, click works | `PUT /api/products/:id` → **403** |
| Call `fetch("POST /api/products", …)` from console | N/A | **403** |
| Navigate to `/dashboard/products/new` | Form renders | `POST /api/products` on submit → **403** |
| Modify `role` in React DevTools | Buttons appear | API reads role from Firestore → **403** |
| Replay admin's token after demotion | Buttons may still show until refresh | Next API call reads updated Firestore role → **403** |

The last row highlights why role is stored in Firestore and re-read per request — not embedded in the client or JWT alone.

---

## End-to-end flows

### Viewer browses products (happy path)

```
1. Login → AuthContext.role = "viewer"
2. /dashboard/products → table renders, no action buttons
3. GET /api/products → verifyToken ✓ → 200 + products
4. User searches and sorts — all client-side, no API writes
```

### Viewer attempts to delete a product (blocked)

```
1. Viewer calls DELETE /api/products/abc123 from browser console
   with valid Bearer token
2. verifyToken() → { uid, role: "viewer" }
3. requireAdmin("viewer") → { error: "Admin access required", status: 403 }
4. Response: 403 — product unchanged in Firestore
```

### Admin edits a product (happy path)

```
1. Login → AuthContext.role = "admin"
2. Products list shows Edit button → /dashboard/products/abc123/edit
3. GET /api/products/abc123 → verifyToken ✓ → 200
4. Submit form → PUT /api/products/abc123
   → verifyToken ✓ → requireAdmin ✓ → updateProduct() → 200
```

### Viewer navigates to Users page (blocked in UI)

```
1. Viewer types /dashboard/users
2. useEffect: currentRole === "viewer" → router.replace("/dashboard")
3. If fetch somehow fires: GET /api/users → requireAdmin → 403
```

### Admin demotes themselves (blocked)

```
1. Admin clicks demote on own row
2. UI: toast.error("You cannot change your own role")
3. API (if bypassed): PATCH /api/users/{own-uid} → 400
```

---

## Defence-in-depth layers

This project applies role checks at multiple levels:

```
Layer 1 — Edge proxy (proxy.ts)
  Session cookie required for /dashboard/* and /api/products/*
  Does NOT check role — authentication only

Layer 2 — Client UI (React)
  Conditional rendering based on AuthContext.role
  Page redirect for /dashboard/users

Layer 3 — API handlers (authoritative)
  verifyToken() + requireAdmin() on every write
  Role from Firestore, not client
```

Only **Layer 3** is a security control. Layers 1–2 improve UX and reduce accidental access.

---

## Key files

| File | Role-based behaviour |
|---|---|
| `app/context/AuthContext.tsx` | Loads and exposes `role` to all client components |
| `app/api/auth/me/route.ts` | Returns role from Firestore to client |
| `lib/auth/middleware.ts` | `verifyToken()`, `requireAdmin()` — server enforcement |
| `app/components/Sidebar.tsx` | Hides admin nav for viewers |
| `app/dashboard/products/page.tsx` | Hides New / Edit / Delete for viewers |
| `app/dashboard/users/page.tsx` | Admin-only page with redirect guard |
| `app/components/ProductForm.tsx` | Submits to API (server decides permission) |
| `app/api/products/route.ts` | POST requires admin |
| `app/api/products/[id]/route.ts` | PUT, DELETE require admin |
| `app/api/users/route.ts` | GET requires admin |
| `app/api/users/[id]/route.ts` | PATCH requires admin |

---

## Testing role boundaries

### Manual checklist

**As viewer:**
- [ ] Products list loads — no New Product button, no Edit/Delete icons
- [ ] Sidebar — no Users link under Admin section
- [ ] `/dashboard/users` — redirected to `/dashboard`
- [ ] Dashboard KPIs and charts load normally

**As admin:**
- [ ] New Product button visible — create succeeds
- [ ] Edit and Delete work on product rows
- [ ] Users page loads — can promote/demote others
- [ ] Cannot demote self — UI error + API 400

### Verify server enforcement (viewer token)

```bash
# Should return 403 — not 200 or 500
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/products \
  -H "Authorization: Bearer <VIEWER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","category":"Software","price":9.99,"status":"active"}'
# Expected: 403

curl -s -o /dev/null -w "%{http_code}" -X DELETE http://localhost:3000/api/products/<ID> \
  -H "Authorization: Bearer <VIEWER_TOKEN>"
# Expected: 403

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/users \
  -H "Authorization: Bearer <VIEWER_TOKEN>"
# Expected: 403
```

Replace `<VIEWER_TOKEN>` with a Firebase ID token from a signed-in viewer session.

---

## Known gaps & improvements

| Gap | Risk | Suggested fix |
|---|---|---|
| Create/edit pages lack client admin redirect | Viewer sees form that cannot submit | Add `useEffect` redirect when `role !== "admin"`, matching Users page |
| Edge proxy does not check role | Viewer can load admin page URLs | Acceptable — API blocks mutations; optional middleware role check for `/dashboard/users` |
| Role in client state can be stale until refresh | UI briefly wrong after role change | Refetch `/api/auth/me` after admin demotes a user in same session |
| No Firestore Security Rules | Defence-in-depth missing if client SDK added later | Add rules aligned with server permissions |

These gaps do **not** compromise data integrity today because all writes go through `requireAdmin()` on the server.

---

## Related documentation

- [Step 1 · Authentication & Authorization](./01-authentication-and-authorization.md) — auth flow, token verification, role storage
- [Step 2 · Product CRUD](./02-product-crud.md) — which product operations are admin-only
- [Step 4 · Database Design](./04-database-design.md) — `users.role` field in Firestore
