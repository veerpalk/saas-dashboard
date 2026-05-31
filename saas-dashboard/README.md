# SaaS Product Management Dashboard

A full-stack SaaS dashboard built with **Next.js 16**, **Firebase** (Auth + Firestore), and **TypeScript**. Authenticated users browse products and view analytics; admins create, edit, and delete products and manage user roles.

**Stack:** Next.js App Router · Firebase Auth · Firestore · TanStack Table · Recharts · Zod · Tailwind CSS

---

## Table of Contents

1. [Setup Instructions](#setup-instructions--under-5-minutes)
2. [Architecture Overview](#architecture-overview)
3. [Database Schema](#database-schema)
4. [Security Decisions](#security-decisions)
5. [Trade-offs & Scope Decisions](#trade-offs--scope-decisions)
6. [What's Next](#whats-next)
7. [AI Tool Usage](#ai-tool-usage)
8. [Detailed Documentation](#detailed-documentation)

---

## Setup Instructions (< 5 minutes)

### Prerequisites

- **Node.js 18+**
- A **Firebase project** with:
  - **Email/Password** authentication enabled
  - **Firestore** database created (production or test mode)

### 1. Clone & install

```bash
git clone https://github.com/veerpalk/saas-dashboard.git
cd saas-dashboard/saas-dashboard   # Next.js app lives in this subfolder
npm install
```

> If you already cloned the repo, ensure you are in the directory that contains `package.json`.

### 2. Environment variables

Create `.env.local` in the project root (same folder as `package.json`):

```env
# Firebase Client SDK (browser — safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin SDK (server only — never commit)
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase Console → Project Settings → Your apps → Web app config |
| `FIREBASE_ADMIN_*` | Firebase Console → Project Settings → Service Accounts → Generate new private key |

Copy values from the downloaded service account JSON into the three `FIREBASE_ADMIN_*` variables. Keep `\n` in the private key string.

**Never commit** `.env.local` or service account JSON files to git.

### 3. Create your first admin

1. Start the dev server (step 4)
2. Register at [http://localhost:3000/register](http://localhost:3000/register) — new accounts default to **`viewer`**
3. In Firebase Console → **Firestore** → `users` → your document → set:

   ```
   role: "admin"
   ```

4. Refresh the app — the **Users** nav item and product edit/delete controls appear

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Unauthenticated visits redirect to `/login`.

### Other commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | ESLint |

---

## Architecture Overview

The browser never talks to Firestore directly. All data flows through **Next.js API routes** guarded by Firebase token verification.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                              │
│  ┌────────────────┐   signIn/signOut   ┌─────────────────────────┐ │
│  │ React UI       │ ─────────────────▶ │ Firebase Auth (Client)  │ │
│  │ Next.js pages  │                    └─────────────────────────┘ │
│  │ AuthContext    │                                                  │
│  └───────┬────────┘                                                  │
│          │  fetch("/api/*")  +  Authorization: Bearer <ID token>     │
└──────────┼───────────────────────────────────────────────────────────┘
           │
┌──────────▼───────────────────────────────────────────────────────────┐
│  Next.js Server                                                         │
│                                                                         │
│  proxy.ts ──────────────▶ session cookie check (page routes)            │
│  app/api/*/route.ts ────▶ verifyToken() + requireAdmin()               │
│  lib/db/*.ts ───────────▶ Firestore Admin SDK (data access layer)      │
│                                                                         │
└──────────┬─────────────────────────────────────────────────────────────┘
           │
┌──────────▼─────────────────────────────────────────────────────────────┐
│  Firestore                                                              │
│  collections: users · products                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Request flow (authenticated API call)

```
1. User signs in → Firebase Client SDK issues ID token
2. Token stored in session cookie (pages) + sent in Authorization header (API)
3. API route calls verifyToken(req)
     → adminAuth.verifyIdToken(token)
     → getUser(uid) from Firestore → role
4. Admin writes call requireAdmin(role) → 403 if viewer
5. Data access layer (lib/db/*.ts) reads/writes Firestore
6. JSON response returned to client
```

### Key components

| Path | Purpose |
|---|---|
| `proxy.ts` | Edge route guard — redirects unauthenticated users to `/login` |
| `lib/firebase/client.ts` | Firebase Client SDK singleton (browser only) |
| `lib/firebase/admin.ts` | Firebase Admin SDK singleton (server only) |
| `lib/auth/middleware.ts` | `verifyToken()` + `requireAdmin()` — used by every API route |
| `lib/db/products.ts` | Firestore CRUD for `products` collection |
| `lib/db/users.ts` | Firestore CRUD for `users` collection |
| `lib/validations/product.ts` | Zod schemas for product create/update |
| `app/context/AuthContext.tsx` | React context — `user`, `role`, `login`, `logout`, `getToken` |
| `app/components/ProtectedRoute.tsx` | Client auth guard for dashboard layout |
| `app/components/Sidebar.tsx` | Navigation — admin items conditionally rendered |
| `app/components/ProductForm.tsx` | Shared create/edit product form |
| `app/components/StatCard.tsx` | KPI metric cards on dashboard |
| `app/dashboard/page.tsx` | Analytics overview (KPIs + Recharts) |
| `app/dashboard/products/page.tsx` | Product list (TanStack Table — search, filter, sort, paginate) |
| `app/dashboard/users/page.tsx` | User management (admin only) |
| `app/api/products/` | Product list + create API |
| `app/api/products/[id]/` | Single product get, update, delete API |
| `app/api/analytics/` | Aggregated KPIs and chart data |
| `app/api/users/` | User list + role update API |
| `app/api/auth/register/` | Account registration |
| `app/api/auth/me/` | Current user role lookup |

### Feature map

| Feature | UI | API | Data layer |
|---|---|---|---|
| Sign up / sign in | `/register`, `/login` | `POST /api/auth/register`, Firebase Client SDK | `lib/db/users.ts` |
| Product CRUD | `/dashboard/products/*` | `/api/products` | `lib/db/products.ts` |
| Dashboard KPIs | `/dashboard` | `GET /api/analytics` | Firestore scan |
| Role management | `/dashboard/users` | `GET/PATCH /api/users` | `lib/db/users.ts` |
| Search & pagination | TanStack Table (client-side) | `GET /api/products` (fetch-all) | — |

---

## Database Schema

Firestore uses **two top-level collections**. There are **no subcollections**.

### Entity relationship

```
Firebase Auth (uid, email)
        │
        │ 1:1 document ID
        ▼
users/{uid}
        │
        │ soft reference (products.createdBy)
        ▼
products/{auto-id}
```

### `users` collection

Document ID = Firebase Auth **uid** (set explicitly, not auto-generated).

```
users/{uid}
  email:     string
  role:      "admin" | "viewer"
  createdAt: Timestamp
```

| Field | Type | Notes |
|---|---|---|
| `email` | string | Mirrors Firebase Auth email |
| `role` | `"admin"` \| `"viewer"` | Read on every API request for authorization |
| `createdAt` | Timestamp | Set at registration |

### `products` collection

Document ID = **auto-generated** by Firestore on `.add()`.

```
products/{auto-id}
  name:      string
  category:  string
  price:     number              // USD float
  status:    "active" | "inactive"
  createdBy: string              // uid of creating admin
  createdAt: Timestamp
  updatedAt: Timestamp
```

| Field | Type | Notes |
|---|---|---|
| `name` | string | 2–100 characters (Zod validated) |
| `category` | string | 2–50 characters |
| `price` | number | Positive, max 1,000,000 |
| `status` | enum | `"active"` or `"inactive"` |
| `createdBy` | string | Soft ref → `users/{uid}`; immutable after create |
| `createdAt` | Timestamp | Immutable |
| `updatedAt` | Timestamp | Refreshed on every update |

### Relationships

| From | To | Type | Enforced by |
|---|---|---|---|
| `products.createdBy` | `users/{uid}` | Many-to-one (soft) | Application — set from `auth.uid` on create |
| User role | API access | Logical | `verifyToken()` + `requireAdmin()` |

Firestore has **no foreign-key constraints**. Deleting a user does not cascade to their products.

### Indexes

Current queries use single-field `orderBy("createdAt")` — auto-indexed by Firestore. Composite indexes would be needed for filtered + sorted server-side queries (see [docs/04-database-design.md](./docs/04-database-design.md)).

---

## Security Decisions

### Authentication flow

1. User signs in via Firebase Client SDK (`signInWithEmailAndPassword`).
2. Firebase returns a short-lived **ID token** (JWT signed by Google).
3. Token stored in a **session cookie** for page navigation (`SameSite=Strict`, 1-hour `max-age`).
4. Every API call sends `Authorization: Bearer <token>`.
5. Server verifies with `adminAuth.verifyIdToken()` — cryptographically signed, cannot be forged client-side.

### Authorization — role from Firestore

Role is **not** embedded in the JWT. On every API request:

```ts
const decoded = await adminAuth.verifyIdToken(token);
const userData = await getUser(decoded.uid);
return { uid: decoded.uid, role: userData?.role ?? "viewer" };
```

Role changes in Firestore take effect on the **next request** without re-login.

### Two-layer enforcement

| Layer | Mechanism | Protects | Trust level |
|---|---|---|---|
| **Edge proxy** (`proxy.ts`) | Session cookie presence | Dashboard pages, product API paths | Authentication only |
| **Client UI** | `role === "admin"` conditional rendering | Hides buttons, nav, admin pages | UX only |
| **API guards** (`lib/auth/middleware.ts`) | `verifyToken()` + `requireAdmin()` | All data reads/writes | **Authoritative** |

Admin-only endpoints call `requireAdmin(role)` before any Firestore operation:

| Endpoint | Admin required |
|---|---|
| `POST /api/products` | ✓ |
| `PUT /api/products/:id` | ✓ |
| `DELETE /api/products/:id` | ✓ |
| `GET /api/users` | ✓ |
| `PATCH /api/users/:id` | ✓ |
| `GET /api/products`, `GET /api/analytics` | Any authenticated user |

**The UI hides controls for viewers, but the server re-checks independently.** A viewer calling `POST /api/products` directly receives **403 Forbidden**.

### OWASP basics

| Principle | Implementation |
|---|---|
| No sensitive data in URLs | Passwords in POST bodies; tokens in headers/cookies, not query strings |
| Proper session handling | 1-hour cookie expiry; logout clears cookie; `SameSite=Strict` |
| Secure token usage | Server-side verification; `FIREBASE_ADMIN_PRIVATE_KEY` never exposed to browser |
| Least privilege | New users default to `viewer`; admin promotion required |

### Safeguards

- Self-demotion blocked: `PATCH /api/users/:id` returns **400** when `id === auth.uid`
- Input validated with **Zod** before Firestore writes
- Browser never receives Admin SDK credentials
- Admin private key only in server environment variables

### Known hardening gaps

| Gap | Production fix |
|---|---|
| Session cookie is JavaScript-accessible | Use `firebase-admin` `createSessionCookie()` for `httpOnly` cookie |
| No Firestore Security Rules | Add rules as defence-in-depth |
| Open registration | Invite-only signed links |

---

## Trade-offs & Scope Decisions

| Decision | What we did | Why |
|---|---|---|
| **No Firestore Security Rules** | All access via Admin SDK in API routes | Browser never hits Firestore; rules add defence-in-depth but weren't required for this architecture |
| **Role in Firestore, not custom claims** | Role read from `users` doc per request | Simpler to update roles; trade-off is extra Firestore read per API call |
| **JS-accessible session cookie** | Cookie for edge proxy only; API uses Bearer token | Fast page-guard; production would use `httpOnly` session cookies |
| **Client-side search & pagination** | TanStack Table filters/paginates in memory | Instant UX for small catalogues; server cursor pagination deferred |
| **Fetch-all products** | Single Firestore query returns entire collection | Fine for demo scale; breaks down at thousands of products |
| **No real-time updates** | Data fetched on mount | `onSnapshot` adds complexity without eval benefit here |
| **Two roles only** | `admin` and `viewer` | Spec requirement; real product would have finer permissions |
| **Hard delete products** | `.delete()` removes document | Simplest CRUD; production would use soft delete + audit log |
| **No automated tests** | Playwright in devDependencies, no test files | Time constraint |
| **Minimal observability** | `console.error` with route tags in API catch blocks | No structured logging, Sentry, or performance monitoring yet |
| **No CI/CD pipeline** | No GitHub Actions or deployment config | Documented as next step; build passes locally |
| **Open registration** | Anyone can register as `viewer` | Admin promotes users manually; production would use invites |
| **Analytics computed on read** | Full product scan per dashboard load | Simple; would use aggregate doc or scheduled rollups at scale |
| **Create/edit pages lack client admin redirect** | Viewer sees form but API returns 403 | Server enforcement holds; UX gap only |

---

## What's Next

If I had another week, priority order:

1. **Structured logging + Sentry** — replace `console.error` with JSON logger; add error tracking and request timing (`durationMs`). See [docs/07-observability.md](./docs/07-observability.md).

2. **CI/CD** — GitHub Actions (lint, typecheck, build) + deploy to Vercel with environment variables. Fix existing lint errors first.

3. **`httpOnly` session cookies** — use `firebase-admin` `createSessionCookie()` for hardened auth flow.

4. **Firestore cursor pagination** — replace fetch-all with `startAfter()` for product list API. See [docs/06-search-and-pagination.md](./docs/06-search-and-pagination.md).

5. **Test suite** — Vitest for `verifyToken`, Zod schemas, DB helpers; Playwright E2E for auth and CRUD flows.

6. **Custom claims for roles** — embed role in JWT to remove per-request Firestore reads.

7. **Audit log** — immutable `audit_logs` collection for every product mutation.

8. **Soft deletes** — `deletedAt` timestamp instead of hard deletes.

9. **Invite-only registration** — admin-generated signed invite links.

10. **Firestore Security Rules** — defence-in-depth even though client never talks to Firestore directly.

---

## AI Tool Usage

This project was built with AI-assisted pair programming. Tools used and how they helped:

### Claude Code (claude-sonnet-4-6)

- Scaffolded boilerplate: API routes, Zod schemas, Firestore helpers, Recharts charts, TanStack Table setup — freeing focus for architecture decisions.
- Caught a TypeScript implicit-`any` error in `lib/db/users.ts` via IDE diagnostics before compile.
- Flagged that `params` in Next.js 15+ dynamic route handlers is a `Promise` — preventing subtle runtime bugs (confirmed in `node_modules/next/dist/docs/`).
- Drafted initial README structure and security analysis.

### Cursor (Claude / Auto)

- Ran and debugged the local dev server; documented auth, CRUD, dashboard, and database design in `docs/`.
- Created step-by-step guides for CI/CD deployment, observability gaps, and role-based UI analysis.
- Explored codebase to produce accurate documentation aligned with actual implementation (e.g. `proxy.ts` vs middleware naming, client-side pagination status).

### What the developer directed

- All architecture decisions: two-layer auth, role storage in Firestore vs custom claims, API shape.
- TanStack Table over a plain list for real sorting, filtering, and pagination.
- Scoping: no real-time, no tests initially, open registration, two-role model.
- Review and approval of trade-offs documented above.

### How AI was used responsibly

- AI generated scaffolding and documentation drafts; **security boundaries** (`verifyToken`, `requireAdmin`, server-side role checks) were intentional design choices, not blindly accepted defaults.
- Generated code was verified against Next.js 16 breaking changes and Firebase Admin SDK patterns.
- Documentation reflects **actual** codebase state, including gaps (no CI, partial observability, client-side pagination).

---

## Detailed Documentation

In-depth guides for each project requirement:

| Doc | Topic |
|---|---|
| [docs/01-authentication-and-authorization.md](./docs/01-authentication-and-authorization.md) | Firebase auth, route protection, roles, OWASP |
| [docs/02-product-crud.md](./docs/02-product-crud.md) | Product CRUD, data access layer, API reference |
| [docs/03-dashboard-and-data-display.md](./docs/03-dashboard-and-data-display.md) | KPIs, charts, TanStack Table, responsive layout |
| [docs/04-database-design.md](./docs/04-database-design.md) | Firestore schema, indexes, multi-tenancy evolution |
| [docs/05-role-based-ui-differences.md](./docs/05-role-based-ui-differences.md) | Admin vs viewer UI + server enforcement |
| [docs/06-search-and-pagination.md](./docs/06-search-and-pagination.md) | Client-side search/pagination, cursor evolution |
| [docs/07-observability.md](./docs/07-observability.md) | Logging, error tracking, performance monitoring |

---

## License

Private project — eval / portfolio use.
