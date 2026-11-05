# MotoKare — HUD / Sci-Fi FUI Website (Phases 1 & 2)

**MotoKare:** Smart Motorcycle Care and Maintenance Monitoring System  
**Reference direction:** RideCheck-inspired workflows with original HUD/FUI styling.  
**Roles:** B2C Rider + B2B Repair Shop.

## Run

No installation or build tools required. Open `index.html` directly in a modern browser, or (recommended) serve this directory locally:

```bash
cd motokare-phase1-2
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Pages included

**Public:** responsive landing page (features, roles, steps, proposed pricing), demo Login, demo Register.

**Rider:** dashboard, My Motorcycles, Components, Maintenance Schedule, Service History, Settings.

**Repair shop:** dashboard, Customers, Service Jobs, Appointments, Reports, Settings.

## Functionality included

- Working navigation and separate rider/workshop experiences.
- Responsive sidebar and mobile navigation.
- Add and edit motorcycles; update odometer; switch active motorcycle.
- Component mileage/due-date indicators, labeled as estimates rather than actual mechanical health.
- Record a service; update corresponding maintenance interval; view history; CSV export.
- Add repair-shop customers, create and advance jobs, book and confirm appointments, CSV export.
- Editable demo profile and local storage persistence, reset action.
- HUD style: neon cyan, technical panels, scan line, animated SVG motorcycle blueprint, ticker, keyboard focus indicators, reduced-motion support.

## Important limitations

This is a **frontend prototype**, not a secure or deployed production application. Registration and sign-in are simulated: passwords are **not stored or authenticated**. Do not enter a real password. Data lives only in the browser's localStorage and is not shared across users or devices. Notifications are on-screen indicators, not email/SMS/push deliveries. Service intervals are illustrative estimates (not sensor diagnostics or manufacturer-approved service guidance). Proposed pricing is not connected to a payment gateway.

The next stages should add server-side accounts, authentication/session handling, database, secure B2B data permissions, notification delivery, correct manufacturer-specific service intervals, and testing.

## Files

- `index.html` — accessible HTML shell.
- `styles.css` — responsive HUD/FUI system with reduced-motion treatment.
- `app.js` — client-side router, content, state and demo interactions.

## Note on design

This is an original MotoKare interface based on the user's stated page layout and intended content. It does not copy RideCheck source code, assets, or branding.