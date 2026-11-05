# MotoKare — PostgreSQL Full-Stack Web Application

MotoKare is a responsive HUD / Sci-Fi motorcycle-maintenance application with two distinct account types: **motorcycle owners (B2C)** and **repair shops (B2B)**. Its frontend remains in plain HTML/CSS/JavaScript; its backend is Node.js with PostgreSQL using the official `pg` driver.

## Folder structure

```text
MotoKare/
├── frontend/
│   ├── index.html          # Public SPA shell and login/registration
│   ├── styles.css          # Neon HUD theme, mobile responsive
│   └── app.js              # Router, forms and API integration
├── backend/
│   ├── server.js           # REST API, authentication, static serving
│   ├── db.js               # PostgreSQL pool, queries, transactions, bootstrap
│   ├── schema.sql          # Tables and indexes, initialized on startup
│   ├── scripts/
│   │   └── migrate-sqlite.js  # Optional one-time SQLite data import
│   └── tests/
│       ├── api.test.js
│       ├── frontend.test.js
│       └── browser_smoke.py    # Optional Playwright smoke test
├── docker-compose.yml     # Local PostgreSQL 16
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Quick start (VS Code, Windows/macOS/Linux)

**You need:** Node.js 22.13 or newer, npm, and PostgreSQL 16 or newer (or Docker Desktop with Compose).

```bash
# Clone the repository (skip if already cloned; use git pull instead)
git clone https://github.com/jeraldfuertes-prog/MotoKare.git
cd MotoKare

# Start the PostgreSQL container (requires Docker Desktop / Docker Engine)
docker compose up -d db

# Install Node.js dependencies
npm install
```

Create your own `.env` by copying `.env.example` (Windows PowerShell: `Copy-Item .env.example .env`; macOS/Linux: `cp .env.example .env`), then run:

```bash
npm start
```

Open **http://127.0.0.1:3000**. PostgreSQL tables are created automatically at server startup. Register a new rider or shop account to use the system. The Node server serves files from `frontend/` as well as `/api/*`, so the browser and API share the same origin and session cookies work.

**No Docker?** Install PostgreSQL locally, create a database/user with suitable permissions, and update `DATABASE_URL` in `.env`. Do not publish `.env` or store real credentials in Git. Cloud-hosted PostgreSQL works with a provider-specific connection URL and TLS settings appropriate to that provider.

## Run checks and API tests

```bash
npm run check
npm test
```

The Node test suite connects to **a real PostgreSQL server** via `DATABASE_URL`. It creates randomly named test schemas and deletes them after running. Never point tests to a production database. The test suites cover registration/login/session cookies, rider and workshop CRUD, data ownership, CSRF checks, API reports, and frontend session-based rendering.

`npm run check` performs syntax checks and does not need a running database. A browser-based Playwright smoke test is optional and requires separate Playwright installation. 

## Main features

- **Accounts:** registration, login, logout, password change, profile editing; server-side sessions; rider/shop role boundaries.
- **Rider:** motorcycle profiles, odometer updates, maintenance component intervals, due/overdue indicators, service history and expenses.
- **Workshop:** customers, service jobs, service statuses, appointments, financial/workload reports.
- **Persistence:** all records are stored in PostgreSQL; no browser-only fake authentication.
- **Frontend:** the original MotoKare HUD visual design and route/navigation behavior are preserved.

## API endpoints

| Method | Path | Role |
|---|---|---|
| GET | `/api/health` | Public |
| POST | `/api/auth/register`, `/api/auth/login`, `/api/auth/logout` | Public or session |
| GET | `/api/auth/me`, `/api/bootstrap` | Session |
| PATCH | `/api/me`, `/api/me/password` | Session |
| GET, POST | `/api/bikes`, `/api/services`, `/api/customers`, `/api/jobs`, `/api/appointments` | Rider or workshop, according to resource |
| PATCH, DELETE | `/api/bikes/:id`, `/api/components/:id`, `/api/customers/:id`, `/api/jobs/:id`, `/api/appointments/:id` | Record owner |
| PATCH | `/api/bikes/:id/odometer` | Rider owner |
| DELETE | `/api/services/:id` | Rider owner |
| GET | `/api/components`, `/api/reports`, `/api/notifications` | Session / role-specific |

Write requests use `Content-Type: application/json` and `X-MotoKare-Client: web`; the browser uses a server-issued `HttpOnly`, `SameSite=Lax` session cookie, not a token in localStorage. API responses remain compatible with the existing frontend.

## Existing SQLite data? (optional migration)

**New installations do not need this step.** If you previously used MotoKare Phase 3 and have an existing `data/motokare.sqlite`, back it up first, then start PostgreSQL and run:

```bash
npm run migrate:sqlite -- ./data/motokare.sqlite
```

This copies users (including existing scrypt password hashes), motorcycles, maintenance components, service history, workshop customers, jobs, and appointments into PostgreSQL. Existing sessions are **not** imported; users sign in again. The import runs in a single PostgreSQL transaction and uses `ON CONFLICT (id) DO NOTHING`, so re-running it doesn't duplicate records. **Do not delete or overwrite the original SQLite file until you have verified the data in PostgreSQL.**

## Security and deployment notes

- `DATABASE_URL` is required; the local Docker credentials are for **development only**.
- Passwords are salted and hashed with `scrypt`; sessions are stored as hashes in PostgreSQL, with server-side expiration and revocation.
- SQL statements use parameterized queries; create-bike and create-service operations use PostgreSQL transactions on the same pool client.
- API endpoints restrict operations to the authenticated account, including independent rider/workshop workspaces.
- Local PostgreSQL is bound to `127.0.0.1` in Docker Compose, not exposed publicly.
- For production: rotate all secrets, host behind HTTPS, set `COOKIE_SECURE=1`, use managed PostgreSQL or configured backups, set up monitoring and audit logging, and arrange independent security testing.
- This release has in-app maintenance reminders based on manually recorded mileage/date, not motorcycle sensor diagnostics or external email/SMS delivery. Rider and shop accounts do not share records without a future consent-based linking system.

**Development status:** Frontend and API source have been migrated to PostgreSQL. Real PostgreSQL integration tests require a PostgreSQL instance; don't assume production readiness from syntax tests alone.