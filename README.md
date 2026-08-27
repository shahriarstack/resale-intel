# Resale Intel

Commercial vehicle recovery → refurbishment → resale-ready pipeline for ACI Motors.
A single web app carrying a repossessed vehicle through eight approving desks, from
field capture to resale-ready. Field roles (Recovery Team, Service Engineer, Sales)
get a mobile-optimised, installable web app; management roles get a desktop console.

## Stack

- **Next.js 16** (App Router) · **React 19**
- **NextAuth v4** — Staff ID + password, bcrypt, JWT sessions (no DB adapter)
- **Prisma 6** → **MySQL**
- **Tailwind 3** with a token-based design system
- Barlow Condensed / IBM Plex Sans / IBM Plex Mono

## Getting started

```bash
npm install
cp .env.example .env         # then fill in DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
npm run db:push              # create the schema in your MySQL database
npm run db:seed              # seed Super Admin + demo roster + master data
npm run dev
```

Sign in at `/login` with any seeded Staff ID (e.g. `ADMIN-01`).
Demo password: `changeme123` — change it after first sign-in.

> If the app shows **"Something went wrong"** after login, the server can't reach
> the database. Check `DATABASE_URL`, make sure MySQL is running, and that you've
> run `db:push` + `db:seed`.

## Local development database (this machine)

A persistent local MySQL is set up at `C:\Users\shahriar.imon\resale-localdb`
(data survives reboots). `.env` points at it; the cPanel/production settings are
saved in `.env.cpanel.bak`.

Each time you sit down to work:

1. **Start the database** — open PowerShell and run, leaving the window open:
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\Users\shahriar.imon\resale-localdb\start-db.ps1
   ```
2. **Start the app** in another terminal: `npm run dev`
3. Open http://localhost:3000 and sign in.

When you deploy to cPanel, copy `.env.cpanel.bak` back to `.env` on the server
(there `127.0.0.1:3306` is the correct database address).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build |
| `npm run db:push` | Push the Prisma schema to the database (no migration history) |
| `npm run db:migrate` | Create/apply a versioned migration (needs a shadow DB) |
| `npm run db:seed` | Seed users, territories, locations, checklist questions |
| `npm run db:studio` | Prisma Studio |

## Architecture

- **`src/lib/rbac.ts`** — roles, the surface each role is built for, and the **state
  machine**: a single `(fromStatus, role, action) → toStatus` table that is the only
  thing allowed to move a vehicle. Every API route resolves against it.
- **`src/lib/session.ts`** — `requireUser` / `requireRole` guards for API routes.
- **`src/lib/audit.ts`** — every transition and edit is written to `VehicleEvent`.
- **`src/lib/costing.ts`** — total = repair + transport + other + registration + SOP.
- **`src/app/(app)/`** — authenticated app; `AppShell` renders a desktop sidebar or a
  mobile bottom nav based on the signed-in role.

## Status of the build

Foundations are complete: data model, auth, RBAC/state machine, audit spine, design
system, role-aware shell, dashboard and the read-only Live Register. The eight desk
workflows (capture, CN approval, assessment, repair sign-off, registration, SOP,
pricing, GM approval) are built on top of these foundations.

## Deployment

Builds to a standalone server (`output: "standalone"`). Secrets belong in the host
environment, never in the repo. Uploaded files must be stored outside the deployment
directory so a release does not delete captured evidence.
