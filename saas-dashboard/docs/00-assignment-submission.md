# Assignment Submission — SaaS Product Management Dashboard

**Author:** Veerpal Kaur  
**Project:** Full-stack SaaS dashboard with Firebase authentication, role-based access, product CRUD, analytics, and CI/CD deployment.

> **Word version:** [00-assignment-submission.docx](./00-assignment-submission.docx)

---

## Live Links

| Resource | URL |
|---|---|
| **GitHub Repository** | [https://github.com/veerpalk/saas-dashboard](https://github.com/veerpalk/saas-dashboard) |
| **Production App (Vercel)** | [https://saas-dashboard-green-zeta.vercel.app/login](https://saas-dashboard-green-zeta.vercel.app/login) |
| **Local Development** | [http://localhost:3000](http://localhost:3000) (after setup below) |

The repository uses a monorepo-style layout: the Next.js application lives in the **`saas-dashboard/`** subfolder. Vercel is configured with **Root Directory = `saas-dashboard`**.

---

## Assignment Overview

This project implements a **SaaS Product Management Dashboard** — a web application where authenticated users can browse products and view analytics, while **admin** users can create, edit, and delete products and manage user roles. **Viewer** users have read-only access.

The assignment required building a production-quality full-stack application with:

- Secure authentication and authorization (Firebase)
- Role-based UI and server-side enforcement
- Product CRUD with validation
- A responsive dashboard with metrics and data visualization
- Documented Firestore schema and indexing strategy
- Search and pagination on the product list
- Basic observability signals
- CI/CD pipeline and cloud deployment

All core requirements are implemented. The app is deployed to Vercel and connected to GitHub Actions for continuous integration.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS 4 (blue-themed UI) |
| Authentication | Firebase Auth (email/password) |
| Database | Cloud Firestore |
| Server SDK | Firebase Admin SDK |
| Tables | TanStack Table v8 (search, filter, sort, paginate) |
| Charts | Recharts |
| Validation | Zod |
| Notifications | react-hot-toast |
| Icons | lucide-react |
| CI | GitHub Actions (lint, typecheck, build) |
| Deployment | Vercel |

---

## Requirements Coverage

### 1. Authentication & Authorization

**Requirement:** Secure sign-up / sign-in using Firebase Authentication. Protect routes and API endpoints. Support at least two roles (admin and viewer). Follow OWASP basics.

| Criterion | Status | Implementation |
|---|---|---|
| Sign-up / sign-in | ✓ | Firebase Client SDK on `/register` and `/login`; `POST /api/auth/register` creates Auth + Firestore user |
| Route protection | ✓ | Edge `proxy.ts` checks session cookie; `ProtectedRoute` on dashboard layout |
| API protection | ✓ | Every API route calls `verifyToken()` from `lib/auth/middleware.ts` |
| Two roles | ✓ | `admin` and `viewer` stored in Firestore `users/{uid}.role` |
| Server-side role checks | ✓ | `requireAdmin()` on mutating endpoints returns 403 for viewers |
| OWASP basics | ✓ | Passwords in POST bodies; tokens in headers/cookies; Admin SDK server-only |

**Detailed doc:** [01-authentication-and-authorization.md](./01-authentication-and-authorization.md)

---

### 2. Product CRUD

**Requirement:** Full create, read, update, delete for products with server-side validation.

| Criterion | Status | Implementation |
|---|---|---|
| Create | ✓ | `POST /api/products` (admin only) + `/dashboard/products/new` |
| Read | ✓ | `GET /api/products`, `GET /api/products/[id]` (any authenticated user) |
| Update | ✓ | `PUT /api/products/[id]` (admin only) + edit page |
| Delete | ✓ | `DELETE /api/products/[id]` (admin only) |
| Validation | ✓ | Zod schemas in `lib/validations/product.ts` |
| Data access layer | ✓ | All Firestore access in `lib/db/products.ts` — API routes never call Firestore directly |

**Detailed doc:** [02-product-crud.md](./02-product-crud.md)

---

### 3. Dashboard & Data Display

**Requirement:** Responsive dashboard with product list filtering/sorting and at least two summary metrics.

| Criterion | Status | Implementation |
|---|---|---|
| Summary metrics | ✓ | Four KPIs: total products, active count, inactive count, total revenue |
| Charts | ✓ | Bar chart (products by category), pie chart (status breakdown), line chart (daily creations, 30 days) |
| Product list | ✓ | `/dashboard/products` with TanStack Table |
| Filtering / sorting | ✓ | Global search, status filter, column sort |
| Responsive layout | ✓ | Sidebar + main content; mobile-friendly cards and tables |

**Detailed doc:** [03-dashboard-and-data-display.md](./03-dashboard-and-data-display.md)

---

### 4. Database Design

**Requirement:** Document Firestore data model, indexing strategy, and schema evolution for multi-tenancy or 10× scale.

| Criterion | Status | Implementation |
|---|---|---|
| Collections documented | ✓ | `users` and `products` — fields, types, relationships |
| Indexing strategy | ✓ | Single-field `orderBy("createdAt")` — auto-indexed; composite indexes noted for future queries |
| Schema evolution | ✓ | Multi-tenancy via `tenantId`, cursor pagination, soft deletes, audit logs discussed |
| ER diagram | ✓ | Firebase Auth uid → `users/{uid}` → soft ref via `products.createdBy` |

**Detailed doc:** [04-database-design.md](./04-database-design.md)

---

### 5. Role-Based UI Differences

**Requirement:** Admin sees edit/delete controls; viewer sees read-only interface. Enforce on the server — don't rely on hiding UI alone.

| Criterion | Status | Implementation |
|---|---|---|
| Admin UI | ✓ | Create product button, edit/delete actions, Users nav, role toggle |
| Viewer UI | ✓ | Read-only product table, no admin nav items |
| Server enforcement | ✓ | `requireAdmin()` on POST/PUT/DELETE products and user management |
| Direct API bypass blocked | ✓ | Viewer calling `POST /api/products` receives 403 Forbidden |

**Detailed doc:** [05-role-based-ui-differences.md](./05-role-based-ui-differences.md)

---

### 6. Search & Pagination

**Requirement:** Server-side or client-side pagination with a search bar. Bonus: Firestore cursor-based pagination.

| Criterion | Status | Implementation |
|---|---|---|
| Search bar | ✓ | Global text filter on product name/category |
| Pagination | ✓ | Client-side, 10 rows per page via TanStack Table |
| Client or server choice | ✓ | Client-side chosen for instant UX at demo scale |
| Bonus: cursor pagination | ✗ | Documented as future evolution, not implemented |

**Detailed doc:** [06-search-and-pagination.md](./06-search-and-pagination.md)

---

### 7. Observability

**Requirement:** Basic logging, error tracking, or performance monitoring. Even structured logging in the API counts.

| Criterion | Status | Implementation |
|---|---|---|
| Basic logging | Partial | Tagged `console.error` in API route catch blocks (e.g. `[GET /api/analytics]`) |
| Structured JSON logging | Not yet | Plain strings today; `lib/logger.ts` pattern documented |
| Error tracking (Sentry) | Not yet | Documented as next step |
| Performance monitoring | Not yet | Documented as next step |

**Detailed doc:** [07-observability.md](./07-observability.md)

---

### 8. CI/CD & Deployment

**Requirement:** Deploy to Vercel, Firebase Hosting, or Azure. GitHub Actions workflow that lints and runs tests earns credit.

| Criterion | Status | Implementation |
|---|---|---|
| GitHub Actions CI | ✓ | `.github/workflows/ci.yml` — lint, typecheck, build on push/PR |
| Vercel deployment | ✓ | Live at [saas-dashboard-green-zeta.vercel.app](https://saas-dashboard-green-zeta.vercel.app/login) |
| Auto-deploy on push | ✓ | Vercel connected to GitHub `main` branch |
| Build fix (Firebase Admin) | ✓ | Lazy initialization in `lib/firebase/admin.ts` so CI placeholder keys don't break `next build` |

**Detailed doc:** [08-ci-cd-and-deployment.md](./08-ci-cd-and-deployment.md)

---

## Architecture Summary

The browser **never talks to Firestore directly**. All data flows through Next.js API routes guarded by Firebase token verification.

```
Browser (React + Firebase Client SDK)
    │
    │  fetch("/api/*") + Authorization: Bearer <ID token>
    ▼
Next.js Server
    ├── proxy.ts              → session cookie check (page routes)
    ├── app/api/*/route.ts    → verifyToken() + requireAdmin()
    └── lib/db/*.ts           → Firestore Admin SDK (data layer)
    │
    ▼
Firestore (users · products collections)
```

### Key files

| Path | Purpose |
|---|---|
| `proxy.ts` | Edge route guard — redirects unauthenticated users to `/login` |
| `lib/firebase/client.ts` | Firebase Client SDK (browser) |
| `lib/firebase/admin.ts` | Firebase Admin SDK (server, lazy init) |
| `lib/auth/middleware.ts` | `verifyToken()` + `requireAdmin()` |
| `lib/db/products.ts` | Product Firestore CRUD |
| `lib/db/users.ts` | User Firestore CRUD |
| `app/context/AuthContext.tsx` | React auth state — user, role, login, logout |
| `app/dashboard/page.tsx` | Analytics overview (KPIs + Recharts) |
| `app/dashboard/products/page.tsx` | Product list (TanStack Table) |
| `app/dashboard/users/page.tsx` | User role management (admin only) |

---

## Database Schema

### `users/{uid}`

| Field | Type | Notes |
|---|---|---|
| `email` | string | Mirrors Firebase Auth email |
| `role` | `"admin"` \| `"viewer"` | Checked on every API request |
| `createdAt` | Timestamp | Set at registration |

Document ID = Firebase Auth **uid** (not auto-generated).

### `products/{auto-id}`

| Field | Type | Notes |
|---|---|---|
| `name` | string | 2–100 chars (Zod) |
| `category` | string | 2–50 chars |
| `price` | number | Positive USD float |
| `status` | `"active"` \| `"inactive"` | |
| `createdBy` | string | uid of creating admin |
| `createdAt` | Timestamp | Immutable |
| `updatedAt` | Timestamp | Updated on every edit |

---

## Security Decisions

1. **Two-layer enforcement:** UI hides admin controls for viewers; API independently verifies role via `requireAdmin()`.
2. **Role in Firestore, not JWT:** Role read from `users/{uid}` on each request — changes take effect immediately without re-login.
3. **Server-only Admin SDK:** `FIREBASE_ADMIN_PRIVATE_KEY` never exposed to the browser.
4. **Input validation:** Zod schemas on all product writes.
5. **Self-demotion blocked:** Admin cannot demote their own role via `PATCH /api/users/:id`.
6. **Secrets management:** `.env.local` and service account JSON gitignored; Vercel env vars for production.

### Known gaps (documented, not hidden)

| Gap | Production fix |
|---|---|
| Session cookie is JavaScript-accessible | Use `createSessionCookie()` for `httpOnly` cookie |
| No Firestore Security Rules | Add rules as defence-in-depth |
| Open registration accepts `role` in body | Strip role from register payload; admin-only promotion |
| Fetch-all products | Cursor pagination at scale |

---

## Deployment Details

### GitHub

- **Repository:** [github.com/veerpalk/saas-dashboard](https://github.com/veerpalk/saas-dashboard)
- **Default branch:** `main`
- **CI workflow:** Runs on every push and pull request — `npm ci` → `lint` → `typecheck` → `build`
- **App directory:** `saas-dashboard/` (CI sets `working-directory` accordingly)

### Vercel

- **Production URL:** [https://saas-dashboard-green-zeta.vercel.app](https://saas-dashboard-green-zeta.vercel.app/login)
- **Root Directory:** `saas-dashboard`
- **Framework:** Next.js (auto-detected)
- **Environment variables:** 6 `NEXT_PUBLIC_FIREBASE_*` + 3 `FIREBASE_ADMIN_*` (copied from local `.env.local`)
- **Deploy trigger:** Automatic on push to `main`

### Post-deploy checklist

- [x] App loads at production URL → redirects to `/login`
- [ ] Register / sign in (requires Firebase Auth authorized domain for `saas-dashboard-green-zeta.vercel.app`)
- [ ] Promote first user to `admin` in Firestore Console
- [ ] Verify dashboard KPIs and product CRUD

---

## UI & Theming

The dashboard uses a **blue color palette** (replacing the initial slate/gray theme):

- Blue-tinted surfaces, cards, sidebar, and filter inputs
- Dark blue text (`#1e3a8a`) in form fields for readability while typing
- Shared CSS utilities in `app/globals.css`: `.input-field`, `.filter-input`, `.card-surface`

Pages: `/login`, `/register`, `/dashboard`, `/dashboard/products`, `/dashboard/products/new`, `/dashboard/products/[id]/edit`, `/dashboard/users`.

---

## Trade-offs & Scope Decisions

| Decision | Rationale |
|---|---|
| Client-side pagination | Instant UX for demo-scale catalogues; server cursors deferred |
| Fetch-all products | Single Firestore query; fine for tens–hundreds of products |
| Role in Firestore vs custom claims | Simpler role updates; extra read per API call |
| No automated tests | Time constraint; Playwright in devDependencies for future use |
| Minimal observability | Tagged `console.error` baseline; structured logging documented as next step |
| Hard delete products | Simplest CRUD; soft delete + audit log deferred |
| Two roles only | Meets spec; finer permissions deferred |

Full trade-off table: [README.md § Trade-offs](../README.md#trade-offs--scope-decisions)

---

## How to Run Locally

```bash
git clone https://github.com/veerpalk/saas-dashboard.git
cd saas-dashboard/saas-dashboard
npm install
```

Create `.env.local` with Firebase client + admin credentials (see [README.md](../README.md#2-environment-variables)).

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register, then set `role: "admin"` on your user document in Firestore Console.

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |

---

## What's Next

If continuing beyond the assignment:

1. Structured logging + Sentry error tracking
2. `httpOnly` session cookies via Firebase Admin
3. Firestore cursor pagination for product list API
4. Vitest unit tests + Playwright E2E
5. Custom JWT claims for roles (remove per-request Firestore read)
6. Audit log collection for product mutations
7. Invite-only registration

---

## AI Tool Usage

This project was built with AI-assisted pair programming:

| Tool | Contribution |
|---|---|
| **Claude Code** | Scaffolded API routes, Zod schemas, Firestore helpers, charts, TanStack Table setup |
| **Cursor (Auto)** | Local dev debugging, documentation (`docs/01`–`08`), CI/CD setup, UI theme refactor, deployment troubleshooting |

The developer directed all architecture decisions (two-layer auth, role storage, API shape, trade-offs) and reviewed generated code against Next.js 16 and Firebase Admin SDK patterns.

Full disclosure: [README.md § AI Tool Usage](../README.md#ai-tool-usage)

---

## Documentation Index

| Document | Topic |
|---|---|
| [00-assignment-submission.md](./00-assignment-submission.md) | **This file** — assignment overview and links |
| [01-authentication-and-authorization.md](./01-authentication-and-authorization.md) | Firebase auth, route protection, OWASP |
| [02-product-crud.md](./02-product-crud.md) | Product CRUD, API reference |
| [03-dashboard-and-data-display.md](./03-dashboard-and-data-display.md) | KPIs, charts, responsive layout |
| [04-database-design.md](./04-database-design.md) | Firestore schema, indexes, evolution |
| [05-role-based-ui-differences.md](./05-role-based-ui-differences.md) | Admin vs viewer UI + server enforcement |
| [06-search-and-pagination.md](./06-search-and-pagination.md) | Search, pagination, cursor evolution |
| [07-observability.md](./07-observability.md) | Logging, error tracking, monitoring |
| [08-ci-cd-and-deployment.md](./08-ci-cd-and-deployment.md) | GitHub Actions + Vercel deployment |
| [README.md](../README.md) | Master README — setup, architecture, security |

---

## Quick Reference Links

- **GitHub:** [https://github.com/veerpalk/saas-dashboard](https://github.com/veerpalk/saas-dashboard)
- **Live app:** [https://saas-dashboard-green-zeta.vercel.app/login](https://saas-dashboard-green-zeta.vercel.app/login)
- **GitHub Actions:** [https://github.com/veerpalk/saas-dashboard/actions](https://github.com/veerpalk/saas-dashboard/actions)

---

*Private project — eval / portfolio use.*
