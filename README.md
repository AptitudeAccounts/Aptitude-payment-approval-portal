# Payment Approval Portal — Starter

Phase 1 of 3: this repo contains the architecture doc, database schema, a
working backend API, and a working frontend prototype for the online
approval portal described in the brief. Read `docs/ARCHITECTURE.md` first —
it explains the key decision (one shared database/API for web + the future
desktop and mobile apps, instead of building a sync layer).

## What's in here

```
docs/ARCHITECTURE.md   — full design doc: stack, data model, security, API
backend/                — Node.js + TypeScript + Express + Prisma API
frontend/               — React + Vite + Tailwind portal (login, dashboard, approval screen)
```

## Running the backend

```bash
cd backend
cp .env.example .env        # then edit DATABASE_URL, JWT secrets, SMTP creds
npm install
npx prisma migrate dev --name init
npm run dev                 # http://localhost:4000
```

You'll need a Postgres database reachable at `DATABASE_URL`. Seed at least
one user (role `FINANCE` or `MANAGER`) with a bcrypt-hashed password to log in
— a seed script is a natural next addition.

## Running the frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

The dashboard and approval screen fall back to sample data if the API isn't
reachable yet, so you can browse the UI standalone before the backend is wired
up.

## Running it entirely on GitHub (Codespaces — no local install)

This repo is pre-configured for GitHub Codespaces, which gives you a full
cloud computer running the app, accessible from your browser only.

1. On GitHub, open your repo → green **Code** button → **Codespaces** tab → **Create codespace on main**.
2. Wait a few minutes the first time — it automatically installs Postgres, creates the database, installs dependencies, and runs migrations (see `.devcontainer/setup.sh`).
3. Once it's ready, open a terminal in the Codespace (it opens one by default) and run:
   ```bash
   bash start.sh
   ```
4. Click the **Ports** tab at the bottom of the Codespace window. You'll see ports `4000` (Backend API) and `5173` (Frontend) — both already set to Public.
5. Click the globe icon next to port `5173` to open the app in a new browser tab. Log in with `admin@aptitude.com` / `Password123!` (or `finance@aptitude.com` / `manager@aptitude.com`).

Important limitations of this path: the Codespace pauses after a period of
inactivity (so the link stops working until you reopen it), and it's not
meant for permanent public use by your team day to day — it's the fastest
way to see the real thing running without installing anything locally. For
always-on hosting, see the Railway/Vercel steps discussed separately.

## What's implemented vs. what's next

Implemented: login (JWT), role-based access, payment request creation with
approval-link generation, the approve/reject/hold decision flow with
IP/device/browser capture, audit logging on every state change, email
notifications, an optional WhatsApp notification hook, and the four screens
from the brief (login, dashboard with tabs, approval "voucher" screen with
batch table support, responsive mobile/desktop layouts).

Not yet built (flagged in the architecture doc as later phases): MFA,
attachment upload endpoint (schema and display are in place; the upload route
itself is a good next task), admin user-management screens, and the desktop
app itself — which per the architecture should be a second client of this
same API rather than a separately synced system.
