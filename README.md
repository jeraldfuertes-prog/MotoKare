# MotoKare — Phase 3 (Full-Stack Motorcycle Maintenance Web App)

MotoKare is a web-based motorcycle maintenance tracking system for **riders (B2C)** and **repair shops (B2B)**, designed in a neon HUD / Sci-Fi FUI style.

Phase 3 upgrades the Phase 1–2 frontend from fake sign-in and browser-only demo data to a **working local API with a persistent SQLite database**. No third-party services or npm dependencies are needed to run the app.

## Prerequisites

- **Node.js 22.13 or newer** (uses built-in `node:sqlite`; Node 22 may print an experimental-feature warning)
- A modern browser

## Quick start

```bash
git clone https://github.com/jeraldfuertes-prog/MotoKare.git
cd MotoKare
npm start
```

Open **http://127.0.0.1:3000**. Create your own **Rider** or **Workshop** account. The database will be created automatically at `data/motokare.sqlite`.

No `npm install` is required. Do **not** open `index.html` with `file://` or run `python -m http.server`: the application needs its Node server for login and data requests.

For development, use `npm run dev` (server restarts on edits). Run `npm test` for integration and frontend rendering tests.

## What works

**Accounts**: registration, real password login, secure server-side sessions, logout, user profile updates, password changes, role-specific permissions, and separate data for every account. Choose the correct B2C/B2B account type when signing in. Switching type signs out first.

**Rider workspace**: create/edit/delete motorcycle profiles, select a bike, update its odometer, see maintenance reminders and estimated intervals, customize service intervals, record maintenance and associated expenses, view history and CSV exports.

**Workshop workspace**: add/edit/delete customers, create/edit/delete service jobs, update job status, create/edit/delete appointments, confirm/complete appointments, dashboard metrics and CSV exports.

**Persisted records**: all records above are stored in SQLite (not browser localStorage). They remain when the browser reloads and when the Node server restarts, as long as the database file remains. Only the selected motorcycle's ID is saved in the browser for convenience.

**Reports and notifications**: API reports and schedule-based due/overdue indications, based on recorded mileage and dates. Notifications are **inside the web application**; no emails, SMS, push messages, or real-time motorcycle sensor readings are included.

## Folder structure

```text
MotoKare/
├── index.html             # HUD/FUI UI shell
├── styles.css             # Responsive theme and accessible focus/motion styles
├── app.js                 # Frontend routing and REST API integration
├── server/
│   ├── index.js           # Node HTTP server, API, validation and authentication
│   └── db.js              # SQLite schema and database queries
├── tests/
│   ├── api.test.js        # End-to-end HTTP/API integration tests
│   └── frontend.test.js   # Frontend rendering/session integration tests
├── .gitignore
├── .env.example
├── package.json
└── README.md
```

## API reference

JSON API served on the same origin at `/api`. For POST, PATCH and DELETE requests send:

```http
Content-Type: application/json
X-MotoKare-Client: web
```

Authentication is carried by a server-issued, `HttpOnly`, `SameSite=Lax` session cookie. The cookie is scoped to `/api`. Do not store passwords or tokens in localStorage. Requests from the frontend automatically send this cookie.

| Method | Route | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | Server health |
| POST | `/api/auth/register` | Public | Register rider/shop |
| POST | `/api/auth/login` | Public | Login |
| POST | `/api/auth/logout` | Any | Revoke current session |
| GET | `/api/auth/me` | Signed in | Signed-in account |
| GET | `/api/bootstrap` | Signed in | Load user's whole dashboard state |
| PATCH | `/api/me` | Signed in | Edit profile and workshop name |
| PATCH | `/api/me/password` | Signed in | Change password and revoke other sessions |
| GET, POST | `/api/bikes` | Rider | List/create motorcycles |
| PATCH, DELETE | `/api/bikes/:id` | Owner rider | Edit/delete bike |
| PATCH | `/api/bikes/:id/odometer` | Owner rider | Update recorded mileage |
| GET | `/api/components` | Rider | Maintenance components |
| PATCH | `/api/components/:id` | Owner rider | Change service interval/due date |
| GET, POST | `/api/services` | Rider | List/add service records |
| DELETE | `/api/services/:id` | Owner rider | Delete history record (interval not reversed) |
| GET, POST | `/api/customers` | Shop | List/create customer records |
| PATCH, DELETE | `/api/customers/:id` | Owner shop | Edit/delete customer |
| GET, POST | `/api/jobs` | Shop | List/create service jobs |
| PATCH, DELETE | `/api/jobs/:id` | Owner shop | Edit, progress, or delete job |
| GET, POST | `/api/appointments` | Shop | List/create bookings |
| PATCH, DELETE | `/api/appointments/:id` | Owner shop | Edit, update status, delete |
| GET | `/api/reports` | Signed in | Account-specific summary |
| GET | `/api/notifications` | Signed in | Due/overdue and booking alerts |

Successful responses are JSON; failed responses include `{ "error": "..." }` with an appropriate HTTP status (400/401/403/404/409/429, etc.). The API enforces record ownership; IDs from other accounts cannot be accessed.

## Configuration

Read `.env.example` for defaults. Environment variables are read directly by Node, not from `.env` files:

| Variable | Default | Description |
|---|---|---|
| `HOST` | `127.0.0.1` | Bind address; `0.0.0.0` for an explicitly secured remote host |
| `PORT` | `3000` | Web server port |
| `DB_PATH` | `./data/motokare.sqlite` | Persistent SQLite file |
| `COOKIE_SECURE` | unset | Set `1` when serving behind **HTTPS** and a trusted proxy |

Example on macOS/Linux:

```bash
HOST=127.0.0.1 PORT=3000 DB_PATH=./data/motokare.sqlite npm start
```

**Database backup:** stop the server before directly copying the SQLite database, or use a SQLite-aware backup method that handles write-ahead logging. Never commit `data/`, `.env`, or backups containing personal information to GitHub.

## Security and project boundaries

- Passwords are hashed with scrypt and unique random salts; sessions are cryptographically random server-side records identified by hashed cookie tokens.
- Sessions expire after 7 days. Logout invalidates the session; password change revokes other sessions.
- Incoming fields are validated and records are queried with SQL parameters and ownership constraints.
- JSON mutations require a custom CSRF header and same-origin `Origin` checks; cross-origin CORS access is not enabled.
- HTTP security headers and an allowlist of static files protect the web app. The database is **never** exposed through the static server.
- The demo visual style, profile/mileage functions, and other pages are retained from the Phase 1–2 UI.

**This release is a working local full-stack MVP, not a production-audited deployment.** Production launch still requires HTTPS hosting, operational backups, monitoring, account recovery/email verification, email/SMS/push delivery if wanted, and independent security/accessibility testing. The current workshop and rider data are intentionally **separate**; shared records between a particular rider and a particular repair shop would require an explicit consent-based linking workflow. Price proposals are informational only: no payment processor exists. Maintenance schedules are estimates and must be compared to the motorcycle manufacturer's manual.

## Tests

```bash
npm test
```

Node's built-in test runner checks registration, login/logout, profile changes, passwords, database persistence, rider operations, shop operations, cross-role and cross-user restrictions, CSRF rejection, and frontend rendering using server sessions.

An optional Playwright Chromium test is at `tests/browser_smoke.py`. It requires a local Chromium installation and Python Playwright; it is **not** part of `npm test`. The browser test could not be executed in the development environment because Chromium blocks local HTTP navigation there.

## Project ownership

MotoKare is an original academic web application designed for the MotoKare project; RideCheck served only as functional and UI/UX inspiration. The source code does not copy RideCheck's assets, source code, or brand.