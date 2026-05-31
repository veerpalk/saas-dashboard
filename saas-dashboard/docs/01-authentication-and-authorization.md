# Step 1 · Authentication & Authorization

> **Requirement:** Implement secure sign-up / sign-in using Firebase Authentication. Protect routes and API endpoints. Support at least two roles (e.g. admin and viewer) with appropriate access controls. Follow OWASP basics: no sensitive data in URLs, proper session handling, secure token usage.

This document describes how authentication and authorization are implemented in this project.

---

## Overview

| Concern | Implementation |
|---|---|
| Identity | Firebase Authentication (email/password) |
| Authorization | Role stored in Firestore (`admin` \| `viewer`) |
| Page protection | Edge proxy (`proxy.ts`) + client `ProtectedRoute` |
| API protection | `verifyToken()` + `requireAdmin()` on every route handler |
| Session | Firebase ID token in cookie (pages) + `Authorization` header (API) |

Firebase Auth answers **who** the user is. Firestore answers **what** they are allowed to do.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│  ┌─────────────┐   Firebase Client SDK    ┌────────────────┐ │
│  │  React UI   │ ──── signIn / signOut ──▶│ Firebase Auth  │ │
│  └──────┬──────┘                          └────────────────┘ │
│         │  fetch("/api/*")                                   │
│         │  Authorization: Bearer <ID token>                  │
└─────────┼───────────────────────────────────────────────────┘
          │
┌─────────▼───────────────────────────────────────────────────┐
│  Next.js Server                                               │
│  proxy.ts          → session cookie check (page routes)       │
│  lib/auth/middleware.ts → verifyIdToken + role lookup (API)   │
│  lib/firebase/admin.ts  → Firebase Admin SDK (server only)    │
│  Firestore users collection → role: "admin" | "viewer"        │
└─────────────────────────────────────────────────────────────┘
```

---

## Sign-up

**Route:** `POST /api/auth/register`  
**UI:** `/register`

1. User submits email and password (sent in the **request body**, never in the URL).
2. Server creates the account in Firebase Auth via the Admin SDK.
3. Server writes a Firestore document at `users/{uid}` with `role: "viewer"` (default).
4. Client auto-logs in and redirects to `/dashboard`.

```ts
// app/api/auth/register/route.ts
const { email, password, role = "viewer" } = await req.json();
const userRecord = await adminAuth.createUser({ email, password });
await createUser(userRecord.uid, email, role);
```

New users always start as **viewer**. There is no self-serve admin registration.

---

## Sign-in

**UI:** `/login`

1. Client calls `signInWithEmailAndPassword` (Firebase Client SDK).
2. Firebase returns a short-lived **ID token** (JWT signed by Google).
3. Token is stored in a session cookie for page navigation:

```ts
// app/context/AuthContext.tsx
document.cookie = `session=${token}; path=/; max-age=3600; SameSite=Strict`;
```

4. `onAuthStateChanged` fires → client calls `GET /api/auth/me` with the token to load the user's role into React context.

---

## Sign-out

1. Client calls Firebase `signOut()`.
2. Session cookie is cleared: `session=; max-age=0`.
3. User is redirected to `/login`.

---

## Route protection

Two layers guard dashboard pages.

### Layer 1 — Edge proxy (`proxy.ts`)

Runs before page renders. Checks for a `session` cookie on matched routes.

| Public (no cookie required) | Protected |
|---|---|
| `/login` | `/dashboard/*` |
| `/register` | `/api/products/*` |
| `/api/auth/register` | |

Unauthenticated requests to protected paths are redirected to `/login?redirect=<path>`. Only the **return path** is in the URL — no passwords or tokens.

### Layer 2 — Client guard (`ProtectedRoute`)

Wraps dashboard layout. If Firebase auth state is empty after loading, redirects to `/login`. Prevents a flash of protected content while auth resolves.

---

## API protection

Every API route handler calls `verifyToken(req)` from `lib/auth/middleware.ts`:

1. Read `Authorization: Bearer <token>` header.
2. Verify the token with `adminAuth.verifyIdToken()` (cryptographic check — cannot be forged).
3. Load the user's role from Firestore (not from the token payload).
4. Return `{ uid, role }` or `{ error, status }`.

```ts
// lib/auth/middleware.ts
const decoded = await adminAuth.verifyIdToken(token);
const userData = await getUser(decoded.uid);
return { uid: decoded.uid, role: userData?.role ?? "viewer" };
```

Admin-only endpoints additionally call `requireAdmin(role)`, which returns **403** if the role is not `"admin"`.

---

## Roles & access control

Roles are defined in `types/index.ts`:

```ts
type Role = "admin" | "viewer";
```

Stored in Firestore:

```
users/{uid}
  email:     string
  role:      "admin" | "viewer"
  createdAt: Timestamp
```

### Permission matrix

| Action | Viewer | Admin |
|---|---|---|
| View dashboard & analytics | ✓ | ✓ |
| `GET /api/products`, `GET /api/analytics` | ✓ | ✓ |
| `POST /api/products` (create) | ✗ | ✓ |
| `PUT /api/products/:id` (update) | ✗ | ✓ |
| `DELETE /api/products/:id` (delete) | ✗ | ✓ |
| `GET /api/users` (list users) | ✗ | ✓ |
| `PATCH /api/users/:id` (change role) | ✗ | ✓ |

### UI vs server enforcement

| Layer | Purpose | Example |
|---|---|---|
| **UI** | Hide controls, redirect non-admins | Sidebar "Users" link only when `role === "admin"` |
| **Server** | Authoritative access control | `requireAdmin()` on every write endpoint |

The UI is convenience only. A viewer who calls `POST /api/products` directly still receives **403 Forbidden**.

### Creating the first admin

1. Register at `/register` (creates a `viewer` account).
2. In Firebase Console → Firestore → `users` → your document → set `role` to `"admin"`.
3. Refresh the app — admin nav and actions appear.

Subsequent admins can be promoted from `/dashboard/users` (admin-only).

### Safeguards

- Admins **cannot demote themselves** (`PATCH /api/users/:id` returns 400 when `id === auth.uid`).
- Role changes take effect on the **next request** — role is read from Firestore each time, not cached in the token.

---

## OWASP compliance

| Principle | How it is addressed |
|---|---|
| **No sensitive data in URLs** | Passwords sent in POST bodies. Tokens sent in `Authorization` headers and cookies, never in query strings. Login redirect param contains only a path (e.g. `/dashboard`). |
| **Proper session handling** | Token expires after 1 hour (`max-age=3600`). Logout clears the cookie. `SameSite=Strict` reduces CSRF risk. |
| **Secure token usage** | Tokens verified server-side on every API request via Firebase Admin SDK. `FIREBASE_ADMIN_PRIVATE_KEY` never exposed to the browser. Role read from Firestore server-side, not trusted from client. |

### Known trade-off

The session cookie is JavaScript-accessible (not `httpOnly`). It is used only for the edge route guard; API security relies on server-side token verification. A production hardening step would use `firebase-admin` `createSessionCookie()` to issue an `httpOnly` cookie.

---

## Key files

| File | Responsibility |
|---|---|
| `lib/firebase/client.ts` | Firebase Client SDK (browser) |
| `lib/firebase/admin.ts` | Firebase Admin SDK (server only) |
| `app/context/AuthContext.tsx` | Auth state, login/logout, role in React context |
| `app/login/page.tsx` | Sign-in form |
| `app/register/page.tsx` | Sign-up form |
| `app/api/auth/register/route.ts` | Create user in Auth + Firestore |
| `app/api/auth/me/route.ts` | Return current user's role |
| `lib/auth/middleware.ts` | `verifyToken()` and `requireAdmin()` |
| `lib/db/users.ts` | Firestore CRUD for `users` collection |
| `proxy.ts` | Edge route guard (session cookie check) |
| `app/components/ProtectedRoute.tsx` | Client-side auth redirect |
| `app/components/Sidebar.tsx` | Role-based nav rendering |
| `app/dashboard/users/page.tsx` | Admin user management UI |
| `types/index.ts` | `Role`, `User` type definitions |

---

## End-to-end request flows

### Viewer loads products

```
GET /dashboard/products
  → proxy.ts: session cookie present → allow
  → ProtectedRoute: user authenticated → render

GET /api/products  (Authorization: Bearer <token>)
  → verifyToken(): valid token, role = "viewer" → 200 + product list
```

### Viewer attempts to create a product

```
POST /api/products  (Authorization: Bearer <token>)
  → verifyToken(): valid token, role = "viewer"
  → requireAdmin("viewer") → 403 Forbidden
```

### Admin promotes a user

```
PATCH /api/users/:id  { role: "admin" }
  → verifyToken(): valid token, role = "admin"
  → requireAdmin("admin"): pass
  → id !== auth.uid: pass
  → updateUserRole() in Firestore → 200
```

---

## Environment variables

Required in `.env.local`:

```env
# Firebase Client SDK (browser-safe)
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...

# Firebase Admin SDK (server only — never expose to client)
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## Manual verification checklist

- [ ] Register a new account at `/register` — lands on dashboard as viewer
- [ ] Sign out and sign back in at `/login`
- [ ] Visit `/dashboard` while logged out — redirected to `/login`
- [ ] As viewer: product list loads; create/edit/delete buttons hidden
- [ ] As viewer: `POST /api/products` returns 403
- [ ] Promote user to admin in Firestore — Users nav and product actions appear
- [ ] As admin: create, edit, delete a product
- [ ] As admin: promote another user at `/dashboard/users`
- [ ] As admin: attempt to demote yourself — blocked with error
