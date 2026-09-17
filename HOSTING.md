# Hosting Resale Intel on cPanel

Everything needed to put a release on a cPanel account, in the order it has to
happen. Read the whole of **Step 4** before you run anything: the database
migration can silently destroy every officer's territory if its steps are run
out of order, and there is no error when that happens — the coverage board
simply reports an unstaffed country.

---

## What the host has to provide

| | |
| --- | --- |
| **Node** | 20.9 or newer. Next 16 refuses to start below it. Set it in cPanel → Setup Node.js App. |
| **MySQL / MariaDB** | Any version cPanel offers. The app uses no vendor-specific features. |
| **Passenger** | What cPanel's Node.js App runs. Nothing else is needed — no PM2, no reverse proxy of your own. |
| **Disk** | ~250 MB for the application, plus the photographs. A capture carries up to eleven images at up to 8 MB each. |

---

## Step 1 — Build and package

On your machine:

```bash
npm run build
```

```bash
powershell -File zip_standalone.ps1
```

That produces `standalone.zip` (~100 MB). The packaging script is not
cosmetic — it removes three things that must never reach a server, and each of
them caused a real failure before it did:

- **`.env`** — Next's standalone output copies the project's own `.env` into
  the bundle. Extracting it on the host overwrites the server's environment
  with `mysql://root@127.0.0.1/resale_local` and `NEXTAUTH_URL=localhost:3001`.
- **`uploads/`** — the local photograph store. Shipping it drops files into the
  live upload directory that no vehicle record points at, so the retention
  sweep can never remove them.
- **Orphaned Prisma engines** — a `prisma generate` that cannot rename its temp
  file (which happens whenever the dev server is holding the DLL) leaves a
  ~24 MB `.tmp<pid>` behind, and the tracer copies every one. Twenty-six of
  them once turned a 200 MB output into 733 MB.

It adds `deploy/` and `prisma/schema.prisma`, so the database work in Step 4
can be done on the server with nothing installed.

---

## Step 2 — Upload

Either use the script:

```bash
powershell -File deploy.ps1
```

It needs five variables in the environment — it no longer carries the cPanel
password, which the previous version did, on four lines, in a folder that gets
zipped and shared:

```bash
$env:CPANEL_HOST="s1.example.com:2083"; $env:CPANEL_USER="acct"; $env:CPANEL_PASS="..."; $env:CPANEL_PATH="/home/acct/public_html/resale"; $env:CPANEL_SITE_URL="https://resale.example.com"
```

Prefer a **cPanel API token** over the account password.

Or do it by hand: upload `standalone.zip` in File Manager, extract it into the
application directory, and touch `tmp/restart.txt`.

---

## Step 3 — Configure the application

In cPanel → **Setup Node.js App**:

| Field | Value |
| --- | --- |
| Application root | the directory you extracted into |
| Application URL | the subdomain |
| Application startup file | **`server.js`** |
| Node version | 20.9+ |

`server.js` is the one Next generates inside the standalone output. The old
hand-written `server.js` at the project root is not used and is not shipped.

Then set the environment variables **in that panel** — Passenger starts the app
with those, not with your shell's:

```
DATABASE_URL=mysql://user:password@localhost:3306/dbname
NEXTAUTH_SECRET=<48 random bytes, base64>
NEXTAUTH_URL=https://resale.example.com
UPLOAD_DIR=/home/<account>/resale-uploads
TZ=Asia/Dhaka
```

Five things about these:

- **`NEXTAUTH_SECRET` is the only real secret in the system.** Anyone who knows
  it can mint a valid session for any role, including Super Admin. Generate it,
  do not compose it: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`.
  Changing it later signs everybody out, which is the correct response to
  suspecting it leaked.
- **`NEXTAUTH_URL` must match what people actually type, scheme included.**
  Sessions are cookies; `https://` and `http://` are different origins.
- **`UPLOAD_DIR` must be outside the application directory.** Unset, photographs
  land in `./uploads` inside the release, and the next deployment that replaces
  that directory destroys every capture photo, repair estimate and handover shot
  in the system — with the records intact and the images simply gone. Create it
  first: `mkdir -p /home/<account>/resale-uploads`.
- **A password containing `]`, `)`, `@` or `/` must be percent-encoded** inside
  `DATABASE_URL`.
- **`TZ` is not optional, and its absence is silent.** A Linux host runs in UTC
  unless told otherwise; this business runs in Dhaka, six hours ahead. Node's
  local-time methods then answer for the wrong day, and the product uses them
  in forty-odd places — month keys, day buckets, "is this backdated".

  What that looks like in practice: a vehicle sold at 02:30 on 1 October is
  20:30 on 30 September in UTC, so `monthKey` files it under **September** and
  the resale P&L reports it in the wrong month. A capture recorded before 06:00
  is stamped "Backdated to yesterday" in its own audit trail. Worse, the
  BROWSER is in Dhaka and the server is not, so for the first six hours of
  every day the two disagree about what day it is — the officer's screen and
  the record it writes do not match, and nothing errors.

  None of this throws. It just quietly produces wrong dates, and every figure
  derived from them inherits the error.

If you keep a `.env` file instead, `update_env.ps1` writes one from environment
variables and refuses an `UPLOAD_DIR` inside the deployment directory.

### Staying inside the process limit

A shared cPanel account has an **NPROC** ceiling — cPanel calls it *Number Of
Processes*, and on CloudLinux it counts **tasks, meaning threads, not just
processes**. This account's ceiling is 100, shared with five other sites. Hit
it and nothing on the account can fork: PHP sites serve blank pages, cron stops,
and the terminal itself stops working, which is what makes it confusing to
diagnose — the tools you would reach for are the ones that break first.

Node is thread-heavy by default and sizes several pools from the machine's CPU
count. On a shared box that count is the *host's*, not your share of it, so the
defaults are wildly too big here. Three settings do almost all the work, and
all three belong in the Node.js App panel beside the four above:

```
UV_THREADPOOL_SIZE=2
NODE_OPTIONS=--max-old-space-size=512 --v8-pool-size=2
```

- **`UV_THREADPOOL_SIZE`** caps libuv's pool, which serves filesystem and DNS
  work. Default 4. This app's file I/O is photograph reads and writes, which are
  not hot.
- **`--v8-pool-size`** caps V8's compiler and GC helper threads. This is the one
  that matters: the default is derived from the host's core count, so on a
  24-core shared machine a single Node process can carry over twenty helper
  threads that do nothing here but count against the ceiling.
- **`--max-old-space-size`** is not about NPROC. It stops one runaway request
  growing the heap until the LVE kills the process, which on this account would
  look like the site randomly 500ing.

The fourth setting goes on the connection string:

```
DATABASE_URL=mysql://user:pass@localhost:3306/dbname?connection_limit=5&pool_timeout=20
```

**Prisma's default pool is `physical_cpus * 2 + 1`** — again the host's cores,
so tens of connections, each with a socket and the Rust query engine's own
tokio workers behind it. Five is chosen deliberately rather than minimally: the
heaviest screen in the product issues **nine** concurrent queries
(`lib/coverage.ts`, the coverage board), and sixteen of the seventeen fan-outs
in the codebase are `Promise.all`, which genuinely need a connection each. Five
runs that board in two waves instead of one. Lower it further and the desks get
visibly slower; raise it and you are spending the account's ceiling on
connections that sit idle.

Nothing in the application spawns processes of its own — there is no
`child_process`, no `worker_threads`, no `cluster` anywhere in `src/`. If the
task count climbs, it is either Passenger holding more app instances than it
needs, or something you ran by hand. **`npm install` on this host is the
classic one**: it forks aggressively, and on an account already near the
ceiling it deadlocks, leaving stuck processes that hold the limit until they
are killed. Install nothing on the server — the release ships complete, and
schema SQL is generated on a workstation with `prisma migrate diff`.

### One method, never both

**Manage the app through the cPanel Node.js interface, or through the terminal
with a process manager. Never mix them.** This is the host's own rule, and it
was learned the expensive way.

cPanel's app manager only tracks processes it started itself. A Node process
launched from the terminal — and `npm`, `npx` and `prisma` all launch Node —
is invisible to it. **Stop and Restart in the panel will not close it.** It
keeps running, holds its slots, and the next one accumulates on top, until the
account hits NPROC and everything on it stops: sibling sites serve blank pages,
cron dies, cPanel's own pages hang, and the terminal answers

```
cagefs_enter: Unable to fork
```

which is the trap closing — the tool you would use to clear it is the tool that
can no longer start. Clearing it then needs the host, because only they can
reach the processes from outside the cage.

This is the second reason the release ships complete and schema SQL is built on
a workstation. The first is that `npm install` forks hard; this one is worse,
because its damage is silent and cumulative and survives every restart you
think fixed it.

If the app ever does need managing from a shell, take it out of the cPanel
Node.js interface entirely and run it under PM2 — one owner, not two.

---

## Step 4 — The database

> **Do not run `prisma db push` first.** The schema in this release has no
> `User.territoryId` column — an officer's territories are `TerritoryPosting`
> rows now, because one column could not say that somebody is covering a vacant
> patch next door. `db push` therefore creates the new table *and drops the old
> column with everything in it* in a single pass. There is no moment in
> between, so a backfill run afterwards has nothing left to read.

**Back the database up first**, from cPanel → Backup, or:

```bash
mysqldump -u user -p dbname > resale-before-migration.sql
```

Then, from the application directory:

```bash
node deploy/00-inspect.mjs
```

It changes nothing and prints exactly which of the steps below are still
needed — read from the database rather than from anyone's memory of what was
deployed last. Run it again after each step.

### 4a. Snapshot, before anything else

```bash
node deploy/01-snapshot-postings.mjs
```

Copies `User.territoryId` into a side table, `_posting_snapshot`, which the
push does not know about and will not touch. It matches that table's collation
to `User.id` — without which the backfill dies on "Illegal mix of collations"
halfway through, with the old column already gone.

Safe on an already-migrated database: it says so and writes nothing.

### 4b. Push the schema

The Prisma CLI is a dev dependency and is not in the release, so install it for
the moment you need it:

```bash
npm install prisma@6 --no-save && npx prisma db push
```

If the host has no outbound npm access, enable **Remote MySQL** for your IP in
cPanel and run `npx prisma db push` from your own machine with `DATABASE_URL`
pointed at the server.

### 4c. Restore the postings

```bash
node deploy/02-backfill-postings.mjs
```

Reads the snapshot and writes a **BASE** posting for each officer — where they
work. COVER, a vacant neighbouring patch somebody has picked up, is a decision
an admin makes in the users console; nothing in the old single-column data
could have distinguished the two.

Idempotent, and conservative: an officer who already holds that territory is
left exactly as they are, including its kind, so re-running can never demote a
COVER back to BASE. It reports any snapshot row it could not restore because
the officer or the territory no longer exists — those people have no patch
until one is set in the console.

`_posting_snapshot` is left in place on purpose. It is the only record of what
the old column held. Drop it once the coverage board looks right.

### 4c-ii. Newer columns

`node deploy/00-inspect.mjs` also reports whether `Vehicle.repairBlocker`
exists — the reason a repair is blocked, added after the first release. It is
additive and nullable, so the `db push` in 4b creates it without touching a
row; the inspector flags it because a release whose code expects a column its
database has not got fails on the engineer's bench, which is not where anybody
looks first.

### 4d. Realign the sign-in credentials

```bash
node deploy/03-align-credentials.mjs
```

**Without this, nobody can sign in.** Sign-in is now a role plus the Staff ID as
the passcode, and every account minted under the old rule carries a hash of a
password nobody will ever type again. The login route checks the hash rather
than trusting the lookup — deliberately — so those accounts are refused with
the same message as a wrong passcode, and no screen anywhere would report why.

Safe to re-run, and worth re-running after any bulk change that touched Staff
IDs outside the admin console.

### 4e. Seed, only on an empty database

```bash
node deploy/00-inspect.mjs
```

If this is a fresh database rather than an upgrade, it will show no users at
all. Seed from your own machine against the server (`npm run db:seed`, with
`DATABASE_URL` pointed at it) — the seed is a dev dependency script and is not
in the release.

---

## Step 5 — TLS

Get the certificate (cPanel → SSL/TLS Status → Run AutoSSL), force HTTPS, and
set `NEXTAUTH_URL` to the `https://` form.

This is not optional housekeeping. Sign-in sends a Staff ID and a passcode, and
the session cookie that comes back is the whole of somebody's authority in the
system; over `http://` both cross the network in clear, on yard wifi and mobile
networks.

---

## Step 6 — Check it

```bash
curl -sI https://resale.example.com/login
```

Then sign in as one real account of each surface — one field role on a phone,
one desk role on a monitor — and check three things the migration touches:

1. **Coverage** (`/coverage`) lists officers against territories, with no patch
   showing an officer who should not be there.
2. An ARO's territory dropdown on an intake form offers **only their own**
   patches, base first.
3. A capture photo uploads and renders, which proves `UPLOAD_DIR` is writable
   and served.

---

## Post-sale photo retention

Photographs of sold vehicles are deleted after **7 days**; the records, costs
and event history stay. The sweep runs inside the application: 30 seconds after
boot, then every six hours.

Passenger spinning the app down when idle and back up on the next request makes
this *more* reliable, not less — the boot sweep fires on nearly every wake. A
Super Admin can also see what the next sweep will take, and run it now, from
the admin console.

---

## Deploying again later

Steps 1–2, then `tmp/restart.txt`. Step 4 only when the schema has changed —
`node deploy/00-inspect.mjs` will tell you.

The upload directory is outside the release and survives. The database is
untouched by a deploy.

---

## Things that will bite

| Symptom | Cause |
| --- | --- |
| App starts, every sign-in fails | Credentials not realigned — Step 4d. |
| Everyone signed out after a deploy | `NEXTAUTH_SECRET` changed, or `.env` was overwritten. |
| Sign-in loops back to `/login` | `NEXTAUTH_URL` does not match the address in the browser, usually `http` vs `https`. |
| Photographs vanish after a deploy | `UPLOAD_DIR` was unset, so they were inside the release. |
| Coverage board shows nobody anywhere | `db push` ran before the snapshot. Restore the backup and start Step 4 again. |
| "Illegal mix of collations" | A `_posting_snapshot` left by an older copy of the script. Drop it and re-run 4a. |
| 503 from Passenger | Read `stderr.log` in the application directory; usually Node version or a missing `DATABASE_URL`. |
