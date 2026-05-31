# CI/CD & Deployment

> **Requirement:** Deploy to Vercel, Firebase Hosting, or Azure. Even a basic GitHub Actions workflow that lints and runs tests earns credit.

This document describes the CI pipeline and how to deploy the app to Vercel.

---

## Overview

| Component | Implementation |
|---|---|
| **CI** | GitHub Actions — lint, typecheck, build on every push/PR |
| **Deployment** | Vercel (recommended for Next.js) |
| **Workflow file** | `.github/workflows/ci.yml` (repo root) |
| **App directory** | `saas-dashboard/` (monorepo-style layout) |

---

## Continuous Integration (GitHub Actions)

### Trigger

Runs on:
- Push to `main` or `master`
- Pull requests targeting `main` or `master`

### Jobs

| Step | Command | Purpose |
|---|---|---|
| Install | `npm ci` | Reproducible dependency install |
| Lint | `npm run lint` | ESLint — code quality |
| Typecheck | `npm run typecheck` | `tsc --noEmit` — type safety |
| Build | `npm run build` | Ensures production build succeeds |

### Working directory

The Next.js app lives in `saas-dashboard/`. The workflow sets:

```yaml
defaults:
  run:
    working-directory: saas-dashboard
```

### CI environment variables

Build requires Firebase env vars. CI uses **placeholder values** — enough for Next.js to compile without real credentials:

```yaml
env:
  NEXT_PUBLIC_FIREBASE_API_KEY: ci-placeholder
  FIREBASE_ADMIN_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nCI_PLACEHOLDER\n-----END PRIVATE KEY-----\n"
  # ... see .github/workflows/ci.yml for full list
```

Real secrets are **never** stored in GitHub Actions for this eval project unless you add them as encrypted repository secrets for deployment.

### View results

1. Push to GitHub
2. Open **Actions** tab on the repository
3. Click the latest **CI** workflow run
4. All steps should show green checkmarks

### Local CI commands

Run the same checks locally before pushing:

```bash
cd saas-dashboard
npm ci
npm run lint
npm run typecheck
npm run build
```

---

## Deployment (Vercel)

Vercel is the recommended host for Next.js — zero-config App Router support, API routes, and automatic preview deploys.

### Prerequisites

- Code pushed to GitHub (`veerpalk/saas-dashboard`)
- CI passing on `main`
- Firebase project configured (same as local dev)

### Step 1 — Import project

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. **Add New… → Project**
3. Import `veerpalk/saas-dashboard`
4. Configure:

| Setting | Value |
|---|---|
| **Root Directory** | `saas-dashboard` |
| **Framework Preset** | Next.js |
| **Build Command** | `npm run build` |
| **Install Command** | `npm ci` |

### Step 2 — Environment variables

In Vercel → Project → **Settings → Environment Variables**, add:

**Client (Production, Preview, Development):**

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

**Server only (Production, Preview, Development):**

```
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
```

Copy values from your local `.env.local`. For `FIREBASE_ADMIN_PRIVATE_KEY`, paste the full PEM including header/footer lines.

### Step 3 — Deploy

Click **Deploy**. Vercel builds and assigns a URL:

```
https://<project-name>.vercel.app
```

Every push to `main` triggers a **production** deploy. Pull requests get **preview** URLs automatically.

### Step 4 — Smoke test production

- [ ] Open production URL → redirects to `/login`
- [ ] Register / sign in works
- [ ] Dashboard KPIs load
- [ ] Products list loads
- [ ] Admin CRUD works (after promoting user in Firestore)

If API calls fail, check **Vercel → Project → Logs** for Firebase env errors.

### `vercel.json`

Optional config at `saas-dashboard/vercel.json` documents build settings. Vercel auto-detects Next.js; root directory is set in the Vercel dashboard.

---

## Deployment flow

```
Developer pushes to GitHub
        │
        ├──────────────────────────────────┐
        ▼                                  ▼
 GitHub Actions CI                   Vercel (on main)
 lint → typecheck → build            build → deploy
        │                                  │
        ▼                                  ▼
   Pass/fail status              https://*.vercel.app
   on PR / commit
```

---

## Branch protection (recommended)

On GitHub → **Settings → Branches → Add rule** for `main`:

- [ ] Require status check: **Lint, typecheck & build**
- [ ] Require pull request before merging (optional)

Prevents merging broken code and blocks bad Vercel deploys.

---

## Alternatives

### Firebase Hosting / App Hosting

Use if you want everything in the Firebase ecosystem. Next.js API routes require **Firebase App Hosting** (not classic static Hosting). More setup than Vercel for this stack.

### Azure Static Web Apps

Connect GitHub repo, set app location to `saas-dashboard`, configure env vars in Azure portal. Works but requires more configuration for Next.js server features.

---

## Security checklist before deploy

- [ ] `.env.local` not committed (gitignored)
- [ ] No `*firebase-adminsdk*.json` in git history
- [ ] Firebase Admin key stored only in Vercel env vars
- [ ] GitHub push protection enabled (secret scanning)
- [ ] Rotate keys if they were ever committed

---

## Troubleshooting

| Problem | Fix |
|---|---|
| CI fails on lint | Run `npm run lint` locally and fix errors |
| CI build fails — missing env | Check placeholder env block in `ci.yml` |
| Vercel builds wrong folder | Set Root Directory = `saas-dashboard` |
| Production API 500 | Verify `FIREBASE_ADMIN_PRIVATE_KEY` formatting in Vercel |
| Firebase auth fails in prod | Add production domain to Firebase Auth authorized domains |

---

## Related documentation

- [README.md](../README.md) — setup and env vars
- [docs/07-observability.md](./07-observability.md) — logging in production
