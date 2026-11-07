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
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Quick start (Windows, locally installed PostgreSQL)

**Prerequisites:** Node.js 22.13 or newer, npm, and an already installed **PostgreSQL 16+** server. Docker, WSL, and containers are **not required**.

1. In PowerShell, open the project folder and install dependencies:

   ```powershell
   cd C:\Users\Administrator\Desktop\MotoKare
   git pull origin main
   npm.cmd install
   ```

   For a fresh machine, clone the repo first: `git clone https://github.com/jeraldfuertes-prog/MotoKare.git`.

2. Verify your local PostgreSQL Windows service is running:

   ```powershell
   Get-Service postgresql*
   ```

   If it is stopped, start the service in Windows Services or from an elevated PowerShell session (service names depend on the installed PostgreSQL version).

3. Open **pgAdmin 4**, connect to your local server using the administrator (`postgres`) account, and open **Query Tool**. Run these statements **separately**, one at a time, with a strong password of your choosing:

   ```sql
   CREATE ROLE motokare LOGIN PASSWORD 'CHOOSE_A_STRONG_PASSWORD';
   ```

   ```sql
   CREATE DATABASE motokare OWNER motokare;
   ```

   If you already have that role or database, reuse it rather than creating it again. The database role must own (or be permitted to create tables and test schemas in) the `motokare` database.

4. Copy the environment template, then edit **`.env`** in VS Code:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set `DATABASE_URL` to the username, password, port, and database you configured in PostgreSQL. **Replace the password placeholder**; it is deliberately not a working credential. URL-encode special characters in the password (for example, `@` becomes `%40`, `#` becomes `%23`). Never commit `.env` to Git.

5. Start MotoKare:

   ```powershell
   npm.cmd start
   ```

   Open **http://127.0.0.1:3000**. On startup, the backend initializes its PostgreSQL tables. Register a rider or shop account to begin.

The Node.js server serves the static `frontend/` files and `/api/*` from the same origin, so the frontend's session cookies work without a separate frontend server.

For macOS/Linux, use the equivalent PostgreSQL service commands, `npm install`, `cp .env.example .env`, and `npm start`. A hosted PostgreSQL server can also be used with a compatible connection string and appropriate TLS configuration.

## Date-based maintenance monitoring (no mileage entry required)

- On the **Rider Dashboard** and **Components → Service Interval Monitor**, MotoKare displays next service dates and days remaining instead of estimated kilometers.
- Open **Components → Edit** to enter the **last service date** and a **service interval in days** for each component. Its next due date is recalculated automatically; riders can customize intervals based on their own motorcycle manuals.
- When you **Record Maintenance**, choose the completed service date; a matching component's next due date becomes that service date plus its interval. Saving older historical records does not override a newer already-recorded service date.
- Status uses the Philippine calendar date (`Asia/Manila`): **On Track** is more than 14 days away, **Service Soon** is 1–14 days away, **Due Today** is today, and **Overdue** is past the due date.
- While the page is open, dates update after midnight through the browser's minute check or upon regaining focus; reminders are shown **inside the app**. There are no background push notifications, email, SMS, or motorcycle sensors.
- Existing databases are upgraded **without deleting data**. Existing due dates stay unchanged, legacy odometer values are preserved, and unknown historical last-service dates remain blank until a rider enters them. New motorcycles start with estimated example due dates, not a fabricated completed-service history.

**Important:** Time-based reminders are scheduling aids, not actual motorcycle-condition measurements. Manufacturer maintenance may also have mileage thresholds; always service sooner if required by usage, symptoms, or the service manual.

## Run checks and API tests

```bash
npm run check
npm test
```

The Node test suite connects to **a real PostgreSQL server** via `DATABASE_URL`. It creates randomly named test schemas and deletes them after running. Never point tests to a production database. The test suites cover registration/login/session cookies, rider and workshop CRUD, data ownership, CSRF checks, API reports, and frontend session-based rendering.

`npm run check` performs syntax checks and does not need a running database. A browser-based Playwright smoke test is optional and requires separate Playwright installation. 

## Main features

- **Accounts:** registration, login, logout, password change, profile editing; server-side sessions; rider/shop role boundaries.
- **Rider:** motorcycle profiles, **date-based maintenance intervals**, automatic days-remaining/due/overdue indicators, service history and expenses. Odometer entry is not required for routine use.
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

- `DATABASE_URL` is required. Use a dedicated PostgreSQL role and store its credentials only in your untracked `.env` file.
- Passwords are salted and hashed with `scrypt`; sessions are stored as hashes in PostgreSQL, with server-side expiration and revocation.
- SQL statements use parameterized queries; create-bike and create-service operations use PostgreSQL transactions on the same pool client.
- API endpoints restrict operations to the authenticated account, including independent rider/workshop workspaces.
- Configure local PostgreSQL to listen only on trusted network interfaces; use Windows firewall rules and PostgreSQL access controls to prevent unwanted external access.
- For production: rotate all secrets, host behind HTTPS, set `COOKIE_SECURE=1`, use managed PostgreSQL or configured backups, set up monitoring and audit logging, and arrange independent security testing.
- This release has in-app maintenance reminders calculated from **calendar dates**, not motorcycle sensor diagnostics or external email/SMS delivery. Rider and shop accounts do not share records without a future consent-based linking system.

**Development status:** Frontend and API source have been migrated to PostgreSQL. Real PostgreSQL integration tests require a PostgreSQL instance; don't assume production readiness from syntax tests alone.