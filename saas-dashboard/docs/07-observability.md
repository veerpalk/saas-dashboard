# Observability

> **Requirement:** Add basic logging, error tracking, or performance monitoring (Firebase Performance, Sentry, or equivalent). Even a simple structured logging approach in the API counts.

This document describes what observability signals exist in this project today, what the requirement expects, and how to evolve toward structured logging, error tracking, and performance monitoring.

---

## Overview

| Signal type | Purpose | Current status |
|---|---|---|
| **Logging** | Record what happened (requests, errors, context) | Partial — tagged `console.error` in API catch blocks |
| **Error tracking** | Aggregate, alert on, and debug exceptions | Not implemented |
| **Performance monitoring** | Measure latency and bottlenecks | Not implemented |

| Layer | Mechanism | Location |
|---|---|---|
| Server errors | `console.error("[ROUTE]", err)` | API route `catch` blocks |
| Client errors | `toast.error(...)` | React pages and components |
| Auth failures | HTTP 401/403 responses | No logging |
| Success paths | — | Not logged |
| Structured JSON logs | — | Not implemented |
| Sentry | — | Not in dependencies |
| Firebase Performance | — | Not configured |

The project has a **minimal error-logging baseline** on the server. It does not yet meet the spirit of the requirement fully — there is no structured logging module, no error tracking service, and no performance instrumentation.

---

## What the requirement means

**Observability** is the ability to understand system behaviour in production from the outside — without redeploying or guessing.

The requirement accepts **any one** of these approaches (or a combination):

| Approach | Examples | Minimum bar |
|---|---|---|
| **Basic logging** | `console.log`, Pino, Winston | Consistent, searchable records of API activity |
| **Structured logging** | JSON logs with `route`, `uid`, `durationMs` | Explicitly stated as sufficient on its own |
| **Error tracking** | Sentry, Bugsnag, Rollbar | Capture exceptions with stack traces and alerting |
| **Performance monitoring** | Firebase Performance, Sentry Performance, custom timing | Measure slow endpoints and page loads |

The eval text emphasises: *"Even a simple structured logging approach in the API counts."* — intentionality matters more than vendor choice.

---

## The three pillars

```
┌─────────────────────────────────────────────────────────────────┐
│                        Observability                             │
├─────────────────┬─────────────────────┬───────────────────────────┤
│     LOGS        │   ERROR TRACKING    │   PERFORMANCE             │
│  What happened? │   What broke?       │   How fast?               │
├─────────────────┼─────────────────────┼───────────────────────────┤
│  info / warn /  │  Sentry, Rollbar    │  Firebase Performance     │
│  error levels   │  grouped exceptions │  Sentry Performance       │
│  structured JSON│  alerts + releases  │  durationMs in logs       │
└─────────────────┴─────────────────────┴───────────────────────────┘
                              │
                              ▼
                   Debug production incidents
```

### 1. Logging

Records events with context:

| Level | Use case |
|---|---|
| `info` | Successful request, user action |
| `warn` | Recoverable issue (slow query, deprecated path) |
| `error` | Failed operation affecting the user |
| `debug` | Verbose detail (development only) |

**Structured** logs use machine-readable fields:

```json
{
  "level": "error",
  "message": "request_failed",
  "route": "GET /api/products",
  "uid": "abc123",
  "durationMs": 142,
  "error": "Firestore unavailable",
  "timestamp": "2026-05-31T12:00:00.000Z"
}
```

Plain strings like `console.error("something broke")` are harder to search and filter in log aggregators (Vercel, Cloud Logging, Datadog).

### 2. Error tracking

 Goes beyond logging:

| Logging alone | + Error tracking (Sentry) |
|---|---|
| Errors in stdout — manual tailing | Dashboard grouped by route and release |
| No alerting | Slack/email on new issues or spikes |
| Stack traces may be truncated | Full stack + request context + breadcrumbs |

### 3. Performance monitoring

Answers *"is it slow?"*:

| Metric | Example in this app |
|---|---|
| API latency | `GET /api/analytics` scanning all products |
| Firestore read time | `getAllProducts()` duration |
| Page load | `/dashboard` time to interactive |
| Custom traces | `createProduct` write latency |

---

## Current implementation

### Server-side: tagged `console.error`

API routes wrap Firestore and business logic in `try/catch` and log failures with a **route prefix**:

```ts
// app/api/products/route.ts
} catch (err) {
  console.error("[GET /api/products]", err);
  return Response.json({ error: "Failed to fetch products" }, { status: 500 });
}
```

#### Routes with error logging

| Route | Handler | Log tag |
|---|---|---|
| `GET /api/products` | List products | `[GET /api/products]` |
| `POST /api/products` | Create product | `[POST /api/products]` |
| `PUT /api/products/:id` | Update product | `[PUT /api/products/:id]` |
| `DELETE /api/products/:id` | Delete product | `[DELETE /api/products/:id]` |
| `GET /api/analytics` | Dashboard KPIs | `[GET /api/analytics]` |
| `GET /api/users` | List users | `[GET /api/users]` |
| `PATCH /api/users/:id` | Update role | `[PATCH /api/users/:id]` |

#### Routes without error logging

| Route | Behaviour on failure |
|---|---|
| `GET /api/auth/me` | No try/catch — relies on `verifyToken` return value |
| `POST /api/auth/register` | Returns `{ error: error.message }` — **no `console.error`** |

```ts
// app/api/auth/register/route.ts — silent server log on failure
} catch (error: any) {
  return NextResponse.json({ error: error.message }, { status: 500 });
}
```

#### Auth middleware — no logging

`verifyToken()` in `lib/auth/middleware.ts` returns `{ error, status: 401 }` on invalid tokens without logging. Auth failures are invisible in server logs.

### Client-side: toast notifications

The browser does not report errors to any backend service. Failures are shown to the user via `react-hot-toast`:

| Component / page | User-facing error |
|---|---|
| `app/dashboard/products/page.tsx` | "Failed to load products", "Failed to delete product" |
| `app/dashboard/users/page.tsx` | "Failed to load users", role update errors |
| `app/components/ProductForm.tsx` | Validation / network errors |
| `app/components/Sidebar.tsx` | "Failed to log out" |
| `app/dashboard/page.tsx` | Inline error message (analytics load failure) |
| `app/login/page.tsx` | Form error messages (invalid credentials) |

These toasts improve UX but **do not create server-side observability signals**.

### What is not implemented

| Capability | Status |
|---|---|
| Central logger module (`lib/logger.ts`) | Missing |
| Structured JSON log fields | Missing |
| Success / info-level request logs | Missing |
| Request duration (`durationMs`) | Missing |
| Correlation / request IDs | Missing |
| Sentry or equivalent | Not in `package.json` |
| Firebase Performance | Not configured |
| Client error reporting to backend | Missing |
| Log redaction policy (tokens, secrets) | Not documented in code |
| Audit log for admin mutations | Missing |

---

## Architecture (current vs target)

### Current

```
Browser                         Next.js API                    Firestore
   │                                 │                              │
   │  fetch("/api/products")         │                              │
   │ ───────────────────────────────▶│  getAllProducts() ──────────▶│
   │                                 │                              │
   │  toast.error on failure ◀───────│  console.error on catch      │
   │  (user only)                    │  (stdout only)               │
   │                                 │                              │
   │  [no error reporting]           │  [no success logs]           │
   │  [no performance traces]        │  [no timing]                 │
```

### Target (structured logging — sufficient for requirement)

```
Browser                         Next.js API                    Firestore
   │                                 │                              │
   │  fetch("/api/products")         │  logger.info("request_start")│
   │ ───────────────────────────────▶│  getAllProducts() ──────────▶│
   │                                 │  logger.info("request_ok",   │
   │                                 │    { durationMs, count })    │
   │ ◀───────────────────────────────│                              │
   │                                 │                              │
   │  toast.error (UX)               │  logger.error("request_fail",│
   │                                 │    { route, uid, durationMs })│
   │                                 │  → JSON line to stdout       │
   │                                 │  → optional: Sentry.capture  │
```

---

## Error handling pattern in API routes

Every protected route follows a consistent shape:

```ts
export async function GET(req: NextRequest) {
  // 1. Auth
  const auth = await verifyToken(req);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  // 2. Business logic (optionally admin check)
  try {
    const data = await someDbFunction();
    return Response.json({ data });
  } catch (err) {
    // 3. Observability hook (today: console.error only)
    console.error("[GET /api/example]", err);
    return Response.json({ error: "Failed to …" }, { status: 500 });
  }
}
```

| Step | Logged today? | User sees |
|---|---|---|
| Auth failure (401) | No | `{ error: "Invalid or expired token" }` |
| Forbidden (403) | No | `{ error: "Admin access required" }` |
| Validation (422) | No | `{ error: "Validation failed", issues: … }` |
| Not found (404) | No | `{ error: "Product not found" }` |
| Server error (500) | Yes — `console.error` | Generic `{ error: "Failed to …" }` |

**Gap:** Only unexpected exceptions (500 path) reach the logs. Expected errors (401, 403, 422) are silent on the server.

---

## Recommended: structured logging module

The fastest path to clearly satisfy the requirement is a small `lib/logger.ts`:

```ts
// lib/logger.ts — proposed (not in repo today)
type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function emit(level: LogLevel, message: string, ctx?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...ctx,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { error: err.message, stack: err.stack };
  }
  return { error: String(err) };
}

export const logger = {
  debug: (message: string, ctx?: LogContext) => emit("debug", message, ctx),
  info: (message: string, ctx?: LogContext) => emit("info", message, ctx),
  warn: (message: string, ctx?: LogContext) => emit("warn", message, ctx),
  error: (message: string, err: unknown, ctx?: LogContext) =>
    emit("error", message, { ...ctx, ...serializeError(err) }),
};
```

### Example usage in an API route

```ts
export async function GET(req: NextRequest) {
  const start = Date.now();
  const route = "GET /api/products";

  const auth = await verifyToken(req);
  if ("error" in auth) {
    logger.info("auth_failed", { route, status: auth.status, durationMs: Date.now() - start });
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const products = await getAllProducts();
    logger.info("request_ok", {
      route,
      uid: auth.uid,
      role: auth.role,
      count: products.length,
      durationMs: Date.now() - start,
    });
    return Response.json({ products });
  } catch (err) {
    logger.error("request_failed", err, {
      route,
      uid: auth.uid,
      durationMs: Date.now() - start,
    });
    return Response.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
```

### Recommended log fields

| Field | When to include | Never include |
|---|---|---|
| `route` | Every API log | — |
| `uid` | After auth succeeds | — |
| `role` | Admin/viewer operations | — |
| `status` | Auth failures, HTTP outcomes | — |
| `durationMs` | Every request (performance signal) | — |
| `count` | List endpoints | — |
| `productId` | Single-product operations | — |
| `error`, `stack` | Error logs | — |
| — | — | Tokens, passwords, private keys, full email in debug |

---

## Evolution: Sentry (error tracking)

[Sentry](https://sentry.io) is the most common choice for Next.js error tracking.

### What it adds

| Feature | Benefit |
|---|---|
| Exception grouping | 100 identical Firestore errors → one issue |
| Stack traces | Full trace with source maps |
| Breadcrumbs | User actions before crash |
| Alerts | Notify on new errors or rate spikes |
| Release tracking | Tie errors to deploy version |

### Typical integration

```bash
npx @sentry/wizard@latest -i nextjs
```

```ts
// In API catch blocks — alongside logger
import * as Sentry from "@sentry/nextjs";

} catch (err) {
  logger.error("request_failed", err, { route, uid });
  Sentry.captureException(err, { tags: { route }, user: { id: uid } });
  return Response.json({ error: "Failed to fetch products" }, { status: 500 });
}
```

### Client-side

Sentry's Next.js SDK also captures unhandled React errors — complementing `toast.error`, which users see but operators don't.

| Today | With Sentry |
|---|---|
| ProductForm network error → toast only | Same toast + Sentry event with component stack |
| Unhandled render error → white screen | Error boundary + Sentry report |

---

## Evolution: Firebase Performance

Since the project already uses Firebase, **Firebase Performance Monitoring** is a natural client-side choice.

### What it measures

| Metric | Relevant page |
|---|---|
| Page load time | `/dashboard`, `/dashboard/products` |
| HTTP request duration | `fetch("/api/analytics")` |
| Custom traces | Time from login to dashboard render |

### Setup outline

1. Enable Performance in Firebase Console
2. Add Performance SDK to `lib/firebase/client.ts`
3. Wrap slow operations:

```ts
import { trace } from "firebase/performance";

const t = trace(perf, "load_analytics");
t.start();
const res = await fetch("/api/analytics", { … });
t.stop();
```

### Server-side performance

Firebase Performance is **client-focused**. For API latency, prefer:

- `durationMs` in structured logs (cheapest)
- Sentry Performance transactions
- Custom metrics export (Prometheus, Cloud Monitoring)

**High-value server timing targets in this app:**

| Operation | Why instrument |
|---|---|
| `GET /api/analytics` | Scans entire `products` collection |
| `getAllProducts()` | Same scan — will slow at scale |
| `verifyToken()` + Firestore role read | Runs on every API call |

---

## Client vs server observability

| Event | Server knows? | Client knows? | User sees? |
|---|---|---|---|
| API 500 + console.error | Yes | Yes (failed fetch) | toast.error |
| API 401 invalid token | No log | Yes | Redirect / error |
| API 403 admin required | No log | Yes | toast.error |
| React render crash | No | Yes (blank/error UI) | Broken page |
| Slow analytics load | No timing | Yes (spinner duration) | Wait spinner |
| Firestore error on register | No console.error | Yes | Error message |

**Blind spot:** Client-only failures never reach server logs unless you add client → Sentry or a `/api/client-log` endpoint.

---

## Where to instrument in this codebase

### Priority 1 — API routes (structured logger)

Replace all `console.error` calls and add success logs:

| File | Operations |
|---|---|
| `app/api/products/route.ts` | GET, POST |
| `app/api/products/[id]/route.ts` | GET, PUT, DELETE |
| `app/api/analytics/route.ts` | GET |
| `app/api/users/route.ts` | GET |
| `app/api/users/[id]/route.ts` | PATCH |
| `app/api/auth/register/route.ts` | POST (currently no log) |

### Priority 2 — Auth middleware

```ts
// lib/auth/middleware.ts — log auth failures at info/warn level
if (!authHeader?.startsWith("Bearer ")) {
  logger.warn("auth_missing_header", { route: req.url });
  return { error: "Missing authorization header", status: 401 };
}
```

Do **not** log the token value — only log that auth failed.

### Priority 3 — Data access layer

Optional timing wrapper in `lib/db/products.ts`:

```ts
const start = Date.now();
const snapshot = await adminDb.collection(COL).orderBy("createdAt", "desc").get();
logger.debug("firestore_query", { op: "getAllProducts", count: snapshot.size, durationMs: Date.now() - start });
```

### Priority 4 — Client (Sentry or Firebase Performance)

- Capture unhandled errors in React tree
- Trace page loads for `/dashboard` and `/dashboard/products`

---

## Security: what never to log

| Never log | Why |
|---|---|
| `Authorization` header / Firebase ID tokens | Session hijack risk |
| Passwords (register/login bodies) | Credential exposure |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Full database access |
| Session cookie value | Forgery risk |

| Safe to log | Example |
|---|---|
| Firebase Auth `uid` | `"uid": "abc123"` |
| Route and HTTP status | `"route": "POST /api/products", "status": 201` |
| Error message (not user input) | `"error": "Firestore unavailable"` |
| Duration | `"durationMs": 87` |

---

## Log output in development vs production

| Environment | Where logs go | Notes |
|---|---|---|
| `npm run dev` | Terminal stdout | `console.error` visible immediately |
| Vercel / Node hosting | Platform log drain | JSON lines parseable by log aggregators |
| Firebase / GCP | Cloud Logging (if on GCP) | Structured JSON recommended |

Next.js Route Handlers run on the server — `console.log/error` in `app/api/*` does **not** appear in the browser console.

---

## Requirement coverage

| Requirement | Status | Evidence |
|---|---|---|
| Basic logging | Partial | Tagged `console.error` in 7 catch blocks |
| Structured logging in API | Not met | Plain strings, not JSON |
| Error tracking (Sentry etc.) | Not implemented | — |
| Performance monitoring | Not implemented | — |
| Consistent coverage all routes | Partial | `register` and `auth/me` gaps |

### To fully satisfy with minimal effort

1. Add `lib/logger.ts` with JSON structured output
2. Replace all `console.error("[ROUTE]", err)` with `logger.error(...)`
3. Add `logger.info` on successful API responses with `durationMs`
4. Add logging to `POST /api/auth/register` catch block
5. *(Optional)* Add Sentry for exception grouping and alerts

---

## Example log output (target state)

### Successful product list

```json
{"level":"info","message":"request_ok","timestamp":"2026-05-31T12:00:01.234Z","route":"GET /api/products","uid":"user_abc","role":"viewer","count":25,"durationMs":83}
```

### Failed analytics load

```json
{"level":"error","message":"request_failed","timestamp":"2026-05-31T12:00:02.456Z","route":"GET /api/analytics","uid":"user_abc","durationMs":1204,"error":"9 FAILED_PRECONDITION: The query requires an index","stack":"Error: 9 FAILED_PRECONDITION…"}
```

### Auth failure

```json
{"level":"info","message":"auth_failed","timestamp":"2026-05-31T12:00:03.789Z","route":"GET /api/products","status":401,"durationMs":2}
```

---

## Manual verification checklist

### Current behaviour

- [ ] Trigger a Firestore error (e.g. invalid project config) on `GET /api/products`
- [ ] Check terminal — `[GET /api/products]` error appears in dev server output
- [ ] Trigger failed product delete in UI — user sees toast; server logs DELETE error
- [ ] Invalid token request — **no** server log today (gap)
- [ ] Failed registration — **no** server log today (gap)

### After structured logging (target)

- [ ] Each API success emits JSON `info` line with `durationMs`
- [ ] Each API 500 emits JSON `error` line with `route` and `stack`
- [ ] Auth 401 emits JSON `info`/`warn` without token value
- [ ] Logs parseable with `jq` in terminal: `npm run dev 2>&1 | jq .`

---

## Key files

| File | Observability role |
|---|---|
| `app/api/products/route.ts` | `console.error` on GET/POST failures |
| `app/api/products/[id]/route.ts` | `console.error` on PUT/DELETE failures |
| `app/api/analytics/route.ts` | `console.error` on analytics failures |
| `app/api/users/route.ts` | `console.error` on user list failures |
| `app/api/users/[id]/route.ts` | `console.error` on role update failures |
| `app/api/auth/register/route.ts` | Returns error JSON — no server log |
| `app/api/auth/me/route.ts` | No try/catch logging |
| `lib/auth/middleware.ts` | Auth failures silent |
| `app/dashboard/products/page.tsx` | Client toast on load/delete failure |
| `app/components/ProductForm.tsx` | Client toast on save failure |
| `lib/logger.ts` | **Proposed** — not yet in repo |

---

## Related documentation

- [Step 1 · Authentication & Authorization](./01-authentication-and-authorization.md) — auth failures currently unlogged
- [Step 2 · Product CRUD](./02-product-crud.md) — API routes with catch blocks
- [Step 4 · Database Design](./04-database-design.md) — Firestore queries worth timing at scale
- [Step 6 · Search & Pagination](./06-search-and-pagination.md) — fetch-all pattern affects API latency
