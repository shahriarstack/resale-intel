# Resale Intel

**Intelligence Platform for Resale & Offroad Vehicles** — ACI Motors.

Commercial vehicle recovery → refurbishment → resale-ready pipeline.
A single web app carrying a repossessed vehicle through eight approving desks, from
field capture to resale-ready. Field roles (Recovery Team, Service Engineer, Sales)
get a mobile-optimised, installable web app; management roles get a desktop console.

Alongside the resale pipeline it tracks every OTHER reason a vehicle is off the
road — accidents and police custody — so the recovery organisation has one
register of what is not earning today. Those cases never enter the eight-desk
chain unless they are explicitly converted into a capture.

## Stack

- **Next.js 16** (App Router) · **React 19**
- **NextAuth v4** — role + Staff-ID passcode, bcrypt, JWT sessions (no DB adapter)
- **Prisma 6** → **MySQL**
- **Tailwind 3** with a token-based design system
- Barlow Condensed / IBM Plex Sans / IBM Plex Mono

## Getting started

```bash
npm install
cp .env.example .env         # then fill in DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL
npm run db:push              # create the schema in your MySQL database
npm run db:seed              # seed Super Admin + demo roster + master data
npm run db:credentials       # point every account's passcode at its Staff ID
npm run dev
```

Sign in at `/login` by choosing a **role** and entering that person's **Staff
ID** as the passcode — e.g. *Super Admin* and `ADMIN-01`. See
[Signing in](#signing-in) for what that means and what it costs.

> If the app shows **"Something went wrong"** after login, the server can't reach
> the database. Check `DATABASE_URL`, make sure MySQL is running, and that you've
> run `db:push` + `db:seed`.

## Local development database (this machine)

A persistent local MariaDB lives in `D:\Resale Intel\.devdb` (data survives
reboots). `.env` points at it; the cPanel/production settings are saved in
`.env.cpanel.bak`.

One script starts both. From `D:\Resale Intel`, leaving the window open:

```powershell
.\start-app.ps1          # database if it is not already up, then the dev server
.\start-app.ps1 -Prod    # production build, then serve it
```

Then open **http://localhost:3001** and sign in.

**Port 3001, not 3000.** Another project on this machine holds 3000, and
`NEXTAUTH_URL` in `.env` is pinned to whatever this serves on — a mismatch there
sends sign-in redirects to the wrong app.

**Deploying is not "copy the env file back".** It used to be, because the
release archive carried this machine's `.env` and overwrote the server's on
extract; it no longer does. The server's environment belongs in the cPanel Node
app's own panel — see **[HOSTING.md](HOSTING.md)**, which also covers the
database migration order, which is not optional.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build |
| `npm run db:push` | Push the Prisma schema to the database (no migration history) |
| `npm run db:migrate` | Create/apply a versioned migration (needs a shadow DB) |
| `npm run db:seed` | Seed users, territories, locations, checklist questions |
| `npm run db:studio` | Prisma Studio |

## Signing in

**A role and a passcode.** The role is picked from a dropdown; the passcode is
the person's Staff ID. There is no separately chosen password anywhere in the
product — the admin console has no field for one, the bulk import has no column
for one, and `lib/credential.ts` is the only place a `passwordHash` is derived.

The dropdown is a real check, not a convenience: `authorize` compares it against
the account, so an ARO who selects "Recovery Operations HQ" is refused rather
than admitted to a console they cannot use. It is grouped by surface — *In the
field* / *Head office* — because that is the one thing a person knows about
themselves before they know what we call their desk. Choosing one makes the page
answer back with the designations that role covers and the surface it will land
them on, all read from `ROLE_META`, so the login page cannot describe a role
differently from the rest of the product.

**The login page never says what the passcode is.** The administrator tells a
new officer theirs; the sign-in screen is not the place to publish the rule. The
users console states it plainly, beside the Staff ID field, because that is who
needs to know.

**The credential follows the Staff ID.** Renaming somebody re-credentials them
in the same write — they are one fact, and letting them drift would leave an
account signing in with an ID that is no longer theirs, with no screen anywhere
showing that it had happened. `npm run db:credentials` asserts the rule over
every row; it is idempotent, and worth running after any bulk change that
touched Staff IDs outside the console.

**Case folding, split in two on purpose.** The `staffId` column is
`utf8mb4_unicode_ci`, so the lookup folds case for free — but **bcrypt does
not**. Hashing the stored casing found the account and then refused the
comparison, telling an officer who typed their own ID in lower case that their
passcode was wrong. So `normaliseStaffId` (what gets stored, case preserved) and
`credentialKey` (what gets hashed and compared, upper-cased) are deliberately
different functions.

One message covers every failure — wrong passcode, wrong role for that passcode,
deactivated account. Naming which would tell somebody holding a Staff ID which
desk it belongs to. A failed attempt also spends a bcrypt comparison against a
decoy hash, so the response time does not answer "does this Staff ID exist".

> **The trade, recorded.** A Staff ID is not a secret. It is on the user list, in
> the data room export, beside every offer and read aloud in the yard — so anyone
> who knows one can sign in as that person, and the audit trail cannot then tell
> the named officer from anyone who has seen their ID. This was asked for
> deliberately; it is written down so the trade stays visible rather than being
> discovered later. The hash is still bcrypt: the credential being guessable is a
> decision, the database also holding it in clear text would be a second mistake
> on top of it.

### The sign-in screen is light-on-dark, and the form knew it but the select did not

The card is smoked glass over a deep violet ground, so `.login-card .field`
re-tones the shared form styles to white — and the role select carried its own
colour rules that outranked them by a class. It resolved the placeholder to
`--ink-3`, a mid grey built for a white page, and — worse — a **chosen** role to
`--ink` (`#0e1116`): near-black type on a near-black field. Picking your role
made it disappear.

The states are now named in light-on-dark directly: `rgba(255,255,255,0.58)`
while empty, solid white and 600 once answered, with the caret following the
same ramp and lifting to full white on hover.

**The caret is one `background` shorthand per state, and that is a bug fix
rather than a style preference.** It was written as longhands — `background-image`
beside `background-size`, `-position` and `-repeat` — and three rules collided:
`.login-card .field:focus` re-tones the field with the `background` SHORTHAND,
which resets every longhand it does not name (size to `auto`, repeat to
`repeat`) and outranks the base rule by a class; the hover/focus rule then
re-supplied the image alone, being later and equal in weight. So on a focused
or hovered select the two 5px arrow-halves painted at the size of the whole
control and tiled — a white field with a giant navy wedge through it, which is
what the sign-in screen was showing. A caret is an image PLUS a geometry, and
splitting them across declarations let one survive a reset the other did not.

**The open dropdown is not this card.** It is an OS-drawn sheet that inherits
the select's own colours, so the eleven role names were painted in the closed
field's ink on a surface of the browser's choosing. `color-scheme: dark` plus
explicit `option` / `optgroup` colours give the list its own deep indigo
surface, with the two group labels — "In the field", "Head office" — dimmer and
smaller, because they are the structure of the list rather than entries in it.

### The ground answers the pointer

`components/login/LoginDots.tsx` is the third background layer, and the only one
that knows where the cursor is. The field is a scatter of points on a dark map
and the pointer is a sweep passing over it: where it falls, points brighten,
lean toward it, and the woken ones join to their neighbours with hairlines — a
network assembling itself out of a field that looked empty, and closing again
behind you. A click sends a band outward that wakes what it passes. That is what
this product does, so it is what the ground does.

Sparser and larger than the 4px lattice underneath it — one point per ~54px, on
a jittered grid so it never reads as rows — and at a tenth of an alpha until
something wakes it. Blended with `screen`, so a point over one of the drifting
aurora masses glows and the same point over the dark floor stays quiet: the
layer picks up the motion beneath it for free.

Three things it will not do:

- **Run on a touch screen.** There is no hover on a phone, so the loop would be
  battery spent on an effect nobody can trigger — and this screen is signed into
  from a yard. Coarse pointers get one static frame.
- **Move under `prefers-reduced-motion`.** The brightening stays: it is an
  answer to input, not an animation playing at you. The lean, the idle breath
  and the click ripple stop.
- **Run when nothing is happening.** The loop lives while the pointer is over
  the stage or a ripple is still alive, then paints one settled frame and
  cancels.

Two things that were wrong on the way and are worth not repeating. The layer
first carried a radial mask fading it out across the middle of the stage to keep
it off the form — which hid it over the two thirds of the screen where a pointer
actually travels; it is unnecessary anyway, because the card blurs its own
backdrop at 34px. And the link strength was three fractions multiplied together,
which put the strongest line on the screen at about 4/255: drawn every frame,
and invisible. Both terms are now pulled toward 1 by a fractional power before
they are multiplied.

## Two products, two subjects

This is one codebase serving two things that ask the reader a different
question, and getting the headings wrong makes both harder to use. The rule
lives at the top of `lib/vehicle.ts` so the two definitions sit beside each
other and cannot drift apart.

**The operations product is about an ACCOUNT.** Everything before a sale is
recovery work: a customer has stopped paying, and what an officer, a manager or
a desk is handling is that customer's file. The vehicle is the collateral in
it. Headed by model, two rows from the same customer read as two unrelated
trucks, an officer scanning for a name finds a column of load classes, and the
one fact every conversation about the file opens with — who this is — was the
smallest type on the card.

**The marketplace is about a VEHICLE.** Once the Credit Note clears, the
customer is gone from the story and a buyer is choosing between trucks. There
the customer is not merely secondary, it is none of the reader's business.
`vehicleTitle` heads the storefront and nothing else.

### The heading is a component, not a string

`accountOf()` returns the two halves rather than one string, because they are
typeset differently and truncate in opposite directions — and that was a
decision nine call sites were each about to make on their own:

- **code** — a fixed-width identifier. Mono, tabular, and **never cut**.
  "CUS-41…" identifies nothing, which is the rule the registration already
  follows on these cards.
- **name** — the human half. Truncates, because "Meghna Logis…" is still
  unmistakably the right customer.

`components/ui/AccountTitle` renders that pair. The caller still owns the type
scale — the field panel's `.f-item`, the desk's 13px rows — so `className`
lands on the name and the code sizes itself from it at `0.72em`. One component
means a customer heading reads the same on the officer's phone, in the
manager's inbox, on the engineer's bench and at the top of the vehicle file.

`code` is nullable on purpose: `Vehicle.customerCode` is optional in the
schema, so rows imported before the column existed have a name and no code, and
a heading reading "null · Meghna Logistics" is worse than one reading the name
alone.

### What moved, and what the tables did about it

Cards swapped their two lines: the account heads, and the vehicle drops to the
line beside the registration that identifies it. Tables swapped **columns** —
`Customer` moved to the front and `Vehicle` took the slot it vacated, with the
same three facts and the same sort keys, so nothing had to be added or
explained. Their grid widths swapped share as well as content: column one was
sized for a load class and now carries a code, a name and a registration, while
column two was sized for a customer name and now carries the shorter model.

Two places kept the vehicle deliberately. The **hand-off receipt** records a
truck changing hands, and the **photo gallery** is a gallery of that truck.

The dense ARO capture rows show the registration alone under the heading.
Appending the model there cut the *registration* — "DEMO-OR-RAJ-11-904…" — on a
row that also carries a letter chip and a countdown ring, and the load class
moved into the expanded detail where nothing competes with it.

## Off-road intake

Three ways a vehicle leaves the road, and only one of them is a resale event:

| Intake | Record | Ends in resale? |
| --- | --- | --- |
| **Capture request** | `CaptureRequest` | Pre-approval only — the Recovery Manager rules on the account position (OD #, OD amount, outstanding) *before* a vehicle is seized. Approval unlocks the capture form. |
| **Capture** | `Vehicle` | Yes — the eight-desk pipeline, unchanged. **Only reachable from an approved request or a converted case.** |
| **Accident** | `OffroadCase` (kind `ACCIDENT`) | Usually no. Tracked on a repair countdown until it is back on the road. |
| **Thana / Police** | `OffroadCase` (kind `THANA`) | Usually no. Tracked on a case countdown until released. |

`OffroadCase` is deliberately **not** a `Vehicle`. A truck that is going back to
its owner must never acquire a `Costing` row, a `VehicleStatus` or a place on the
marketplace. When a case *does* stop being returnable — an accident write-off, an
abandoned seizure — it converts: the officer confirms an NOC reference, the case
closes, and they are handed to the ordinary capture form, which stays the only
thing in the system allowed to create a vehicle. From that point every existing
desk rule applies unchanged.

### Three layout traps that cause sideways scroll

All three have the same shape — something reports a large *minimum* width and
its ancestors grow to fit instead of letting it scroll. Checked at 320, 360 and
375px across every field route.

**1. `mx-auto max-w-*` needs `w-full`.** Both shells wrap the page in a column
flex `<main>`, and auto margins on a flex item disable the stretch — so the
wrapper is sized by fit-content and a wide descendant pushes it to its
max-width. The engineer's workbench rendered **672px on a 375px screen**; the
Marketplace's `.sf-page` (`margin: 0 auto`, no width) rendered **696px on a
320px screen**.

**2. Grid and flex items default to `min-width: auto`,** which resolves to
min-content. The vehicle detail page's 620px journey rail inflated its grid
track to **716px on a 360px screen** even though the rail already sat in an
`overflow-x-auto` container. `min-w-0` on the columns fixes it.

**3. An `overflow-x-auto` scroller needs `min-w-0` too,** or it reports its
content's min-content as its own minimum and widens its parent instead of
scrolling.

Text that *clips* rather than overflowing is the other half of "doesn't fit".
Where two identifiers share a line, only the less critical one may be cut — a
registration reading `DEMO-OR-CTG-15-88…` identifies nothing, so it is
`shrink-0` and the customer name wraps or truncates instead.

### Capture, or resale inventory

`VehicleStatus` answers "which desk holds this", which is right for routing
work and wrong for counting stock. Eleven statuses collapse into three things
the business recognises, and the boundary between the first two is one event —
**Credit Note approval** (`lib/status.ts`):

| | Statuses | Off the road? |
| --- | --- | --- |
| **Capture** | `CAPTURED`, `CN_REQUESTED` | Yes — seized, letters running or CN pending |
| **Resale inventory** | `CN_APPROVED` → `LIVE_FOR_RESALE` | **No** — the write-off is authorised; it is stock being assessed, repaired, priced and sold |
| Gone | `RELEASED`, `SOLD` | No |

Off-road = captures + accident cases + custody cases. Resale inventory is
deliberately excluded: nobody is trying to *recover* a truck that is being
repainted for sale. Counting it in told an officer fifteen vehicles needed
recovering when they were already on the way to a buyer.

### One instruction per file

`nextAction()` in `lib/letterSchedule.ts` turns the schedule into the single
thing the officer owes on a captured file: **serve the next letter**, or
**request the Credit Note** once all three are served.

It exists because the ladder is self-driving — Letter 1 the day after capture,
Letter 2 seven days after Letter 1, Letter 3 seven days after that, and serving
Letter 3 locks the file to a Credit Note. At no point is there a decision to
make. So the capture card does not present options: it states the step, says
when it is owed, and offers the one button that takes it. The dashboard counts
the same derived value, so the card and the attention list can never disagree
about what is due.

### There is no such thing as a bare capture

A `Vehicle` can only be created from **one of two origins**, and never from
nothing:

- an **approved** `CaptureRequest` — the manager ruled on the account position
  before the vehicle was touched; or
- a **converted** `OffroadCase` — an accident or seizure that stopped being
  returnable, with an NOC reference on record.

Enforced in `POST /api/vehicles`, not just by hiding a button. `/capture` with
no `requestId` or `caseId` renders a dead end that points at the request form,
and there is no "capture" tile on the intake chooser or the dashboard — a third
door into the form would make the approval gate optional.

### The letter schedule

The escalation ladder now runs on a clock rather than a dropdown:

- **Letter 1** — the day after capture
- **Letter 2** — seven days after Letter 1
- **Letter 3** — seven days after Letter 2

Issue dates are stamped on the vehicle (`letter1At` / `letter2At` / `letter3At`)
and every due date is derived from them — no scheduler, nothing to fail
overnight.

**Every capture starts at `NONE`.** The capture form has no letter picker: it
used to, which let an officer record a vehicle as already at Letter 2 on the
day it was seized, collapsing a fifteen-day notice period into one dropdown. A
`letterStage` sent by any client is ignored.

`canIssueLetter()` then holds two rules on every issue, server-side:

- **Order** — Letter 2 cannot precede Letter 1. A file that jumps to Letter 3
  has skipped the two notices that make the third one lawful.
- **Timing** — a letter cannot be recorded before its due date, because a
  letter recorded before it was sent is a letter that was not sent.

Nothing blocks a letter that is *late* — late is a fact about the world and the
record has to be able to say it happened.

Once **Letter 3** has gone out the customer has had the full notice period and
**Release is closed**: the file resolves through a Credit Note. `WRITTEN` is
refused until all three are served.

### Expected outcome, not "should we capture"

The capture request carries one Yes/No: **once the vehicle is captured, do you
expect the customer to clear the dues?** Both answers still mean taking the
vehicle — that is what the request is *for*. What differs is where the file goes
afterwards:

- **Likely to settle** — the capture is the pressure. Expect payment and the
  vehicle handed back.
- **Unlikely to settle** — expect no further payment and little chance of a
  voluntary return. Plan for a Credit Note and resale.

Recorded for information only; it does not gate the approval.

### The flag channel

An off-road case runs for weeks, and for most of that time nobody has anything
to do. Two flags carry the exceptions, in opposite directions:

- **Support request** (`SUPPORT_REQUEST`) — field → desk. The officer needs
  something they cannot get from the roadside: an authorisation, a document, a
  payment.
- **Attention flag** (`ATTENTION`) — desk → field. The manager wants a case
  chased.

Each side raises one kind and answers the other; the raiser may also withdraw
their own. A note of at least 20 characters is required on both — a flag without
a reason is a notification, and a notification nobody can act on is noise. One
open flag of each kind per case.

### Who can do what

| | ARO | Recovery Manager | Super Admin |
| --- | --- | --- | --- |
| Raise a capture request | ✅ | — | ✅ |
| Rule on one | — | ✅ | ✅ |
| Open an accident / Thana case | ✅ | ✅ | ✅ |
| **Close a case** (on-road / released / converted) | **own cases** | **—** | ✅ |
| Revise a case timeline | — | ✅ | ✅ |
| Raise a support request | ✅ | — | ✅ |
| Raise an attention flag | — | ✅ | ✅ |
| Read the whole off-road book | own only | ✅ | ✅ |

**The Recovery Manager does not close cases.** All three outcomes are assertions
about a physical vehicle — it is back on the road, the thana released it, an NOC
has been signed — and HQ cannot see any of them. The desk supervises through the
clock and the flags instead. Enforced in `canResolveOffroadCase`, and the card
never renders the buttons because `CaseCard` takes a single `viewer` prop
(`"field" | "desk"`) rather than a set of independent capability booleans.

The field estimate (`approxDays`) and the desk's revision (`revisedDays`) are
separate columns on purpose: the gap between them is the signal that a case is
going wrong, and it disappears if the revision overwrites what was first said.

Every desk outside recovery is absent by design — there is nothing to assess on a
truck sitting in a police compound.

## Portals — reading the system without working it

The product has ten roles and every one of them is a desk: it holds files, it
owes a decision, and `rbac.TRANSITIONS` names it. That is the right shape for
the people running the pipeline and the wrong shape for everybody who only ever
needs to **read** it — an auditor, a regional finance office, a board observer,
a lender reviewing collateral. Minting a desk role for each of them would put
rows in a table about decisions, for people who make none.

A **Portal** is the other thing: a lens an admin composes at `/admin/portals`,
by answering three questions in the order they constrain each other in.

| | Question | Grant |
| --- | --- | --- |
| **1** | What may it see? | `band` (whole fleet / captures / resale book) + territories |
| **2** | What may it open? | up to 8 panels, each named for the question it answers |
| **3** | How much of each record resolves? | 4 lenses: costs, customer identity, offers, photographs |

Assign people to it, and they sign in to exactly that. Their nav has one entry.

A new portal opens on **Off-road fleet** and **Pipeline** — what is not earning,
and where the book has got to. Those are the two readings almost every outside
reader is actually asking for, and both render under the default "whole fleet"
band, so a portal is useful the moment it is named. The admin narrows or adds
from there rather than assembling a workspace from nothing.

**Read-only by construction, not by a check.** A member's role is
`PORTAL_VIEWER`, and no row of `TRANSITIONS` names `PORTAL_VIEWER` — so
`availableActions()` returns an empty list for them everywhere, already, without
a single new guard. Nothing about the Portal model has to be trusted for that to
hold; it follows from the transition table being the only way a vehicle moves.

**The studio is a mirror, not a form.** The right half re-renders on every
toggle: it writes the grant back as a sentence of English (the same
`describePortal` the member reads in their own header), and shows a record with
the masks actually applied. "Customer identity: off" is a setting; `R•••• H••••`
is what that setting does, and only one of the two can be misread.

**A panel outside its scope is named, not hidden.** Granting *Letter ladder* to
a resale-book portal turns the row ochre and says why — "this happens before the
Credit Note" — rather than silently rendering an empty panel later. Granting
*Sales & margin* turns the cost lens on with it, because the panel has nothing
to report without it and the studio already knows that.

**Masking, not omission.** A hidden figure keeps its column and reads `Tk ••••`.
A register with the cost column removed reads as vehicles that cost nothing; one
with a masked column reads as a reader who is not cleared for that figure. The
mask is applied in `lib/portalDesk.ts`, before the value reaches the page — a
component is handed `null` for a figure it may not show, so it cannot leak a
number it was never given.

Every panel's query starts from `portalVehicleWhere(grant)`. One clause, built
once: seven panels getting the scope right and the eighth composing its own is
how a read-only grant springs a leak.

`/portal?preview=<id>` renders any portal as its members see it, for a Super
Admin. A read of a workspace, not an impersonation — it runs as the admin,
writes nothing, and the page is read-only for everybody.

## The data room — raw CSV by category

`/exports`, for the five desks that read the whole book rather than work one
file at a time: **Super Admin, Recovery Manager, Sr. Executive, AGM/DGM and the
Business Head.** Eleven categories in three bands, each filterable by date range
and territory.

| Band | Categories |
| --- | --- |
| **Off the road** | Everything off the road · Captures · Accident cases · Police custody |
| **The resale book** | Resale in process · Live for resale · Resold · The whole resale book |
| **Everything else** | Every vehicle · Capture requests · Customer offers |

Two ideas do the work.

### Off the road is a union, not a table

"What is not earning today" spans a seized `Vehicle` and an `OffroadCase` opened
for an accident or a police seizure. Those are deliberately different records —
an `OffroadCase` is not a `Vehicle`, and the schema explains at length why — and
to the person asking the question they are the same thing.

So the four off-road categories share **one row shape**, with a `Kind` column
saying which table a row came from and every other column answered from
whichever source has it:

| | Capture | Accident / Thana |
| --- | --- | --- |
| Off road since | capture date | occurred date |
| Expected back | *(blank — it is not coming back)* | occurred + the desk's revised estimate, or the field's |
| Detail | letter stage | severity / custody reason and the note |
| Account position | from the **capture request** that authorised it | from the case itself |

Rows are sorted together by days off the road, which is the only ordering that
treats a capture and an accident as the comparable things the file says they
are. Resale inventory is excluded, for the reason the rest of the product
excludes it: nobody is recovering a truck that is being repainted for sale.

### Columns are gated; categories are not

All five desks can take any category. What changes is how many columns come
with it. `RESALE_MONEY_ROLES` — cost basis, approved price, margin, offer
amounts — is the Super Admin and the three desks that set or oversee one of
those numbers. The Recovery Manager is deliberately absent and it is not an
oversight: they rule on the Credit Note and their involvement ends there, which
is the same line the coverage board draws for its approved-value column.

Withheld columns are **named on screen, not silently dropped** — a finance
reader told the margin column is not theirs asks for it; one handed a file that
quietly lacks it reads the absence as a zero. `columnsFor()` answers both the
manifest and the file, so a column withheld on screen is absent from the
download by construction rather than by two lists agreeing.

### Nobody should open a CSV to find out whether it was the right one

The right half of the page is a **manifest**, answered by the server for the
exact filters on screen: the live row count, every column that will be in the
file, the columns this desk is not given, the first three rows, and the name the
file will be saved under (`resale-intel_resold_2026-09-15_71-rows.csv` — the
count is what makes two otherwise identical downloads distinguishable).

The count runs the *same* `loadDataset` the download runs. A cheaper `count()`
over a different query is exactly how a manifest ends up promising a number the
file does not contain — and the off-road union has no single count to take.

The CSV writer is the existing `lib/csv.ts`: UTF-8 BOM so Excel renders Bengali
names, and a formula-injection guard that is withheld from bare numbers so a
negative margin stays a figure the sheet can total.

## Post-sale photo retention

Seven days after a vehicle is sold, its photographs are deleted — rows and files
both. Everything else on the file stays.

| | |
| --- | --- |
| **Gone** | pictures of the vehicle: the capture set and the handover set |
| **Kept** | every document slot — the repair estimate, the approval sheet, the registration paperwork, the signed capture form, the photographed remarks |
| **Kept** | the `Vehicle`, its `Costing`, its repair and registration lines, its bids, and every `VehicleEvent` ever written against it |
| **Added** | one `PHOTOS_PURGED` event per vehicle, recording how many images there were and when they went |

**Seven days, not on the day of sale.** A sale is the moment a dispute is most
likely — a buyer who finds something, a desk that queries a figure — and
deleting the photographs the instant the award lands destroys the evidence
exactly when it is most likely to be wanted.

**Documents are not pictures.** The repair cost is quoted against the estimate
sheet; the seizure rests on the signed capture form. Deleting those while
keeping the numbers they justify would leave a record asserting amounts nothing
supports, which is a worse record than one carrying photographs nobody needs.
`PURGEABLE_SLOTS` lists the eleven photo slots explicitly rather than excluding
the documents, so a slot added later is **retained by default**.

**The event is the point.** A deletion with no trace is indistinguishable from a
vehicle nobody ever photographed, and those are very different records. The
vehicle page says so where the gallery used to be.

**In-process, not cron.** This product derives everything it can precisely so
there is no midnight batch to miss — but a deletion cannot be derived, something
has to run. So it runs inside the server that is already running, started once
from `src/instrumentation.ts`: a first pass 30s after boot, then every six
hours. No crontab, nothing to configure per environment, no external caller to
authenticate. The cost is that it only sweeps while the server is up, and two
node processes will run two sweeps — both fine, because the work is idempotent
and a late deletion is still a deletion.

`GET /api/admin/photo-purge` reports what the next sweep will take;
`POST` runs it now. Super Admin only, and the POST is irreversible.

## Nothing on an ARO form is optional

All three forms an officer fills — the **capture**, the **capture request** and
the **off-road case** — now require every field they show. What changed:

| Form | Was optional | Now |
| --- | --- | --- |
| Capture request | Brand, Model, Territory | Required |
| Off-road | Territory, OD #, Overdue amount, Outstanding, Thana reason description | Required |
| Off-road | A photograph — required on an accident only | Required on both kinds |
| Capture | Capture cost, the remarks photograph | Required |

"Every field" means every field **that officer is shown for that case**, not
every key in the schema. An accident has no police station and a Thana case has
no damage severity; the discriminated union already asks each kind only for its
own fields, and those are all required within it. The two structurally
conditional ones stay conditional and should: the case-slip fine is asked only
once a slip is declared, and a vehicle's location is one of *on the master list*
or *typed in*, never both.

### Blank must not become zero

`z.coerce.number()` turns `null`, `undefined` and `""` into **0**. On the three
account-position fields that is not a validation gap, it is a wrong fact: the
desk ranks cases by exposure, and a blank arriving as `0` reads as *this
customer owes nothing* rather than *the officer did not have the statement*.

`requiredAmount()` maps empty to `undefined` before coercing, which is what
lets `required_error` fire. Zero stays a legitimate answer — verified: a case
posted with `odNumber: 0` is accepted, one posted with `null` or `""` is
refused.

### What this costs, recorded

Two of these fields were optional for stated reasons, and the reasons were
real:

- **The account position on an off-road case.** That form is filled at a
  roadside, not at a desk with the statement open. The original note warned
  that requiring it produces three invented numbers, and that an invented
  outstanding is worse than an absent one.
- **The capture cost.** The officer often has no figure to hand at the
  roadside, and a required field gets answered with a guess.

Both are now required because the instruction was that nothing on these forms
is optional. The trade is written into the code beside each field rather than
removed, so whoever revisits it can see what was given up.

The **remarks photograph** is the one most likely to be worth reversing: the
remarks themselves are already required text, so on a capture with nothing
specific to show this asks for a photograph of a notepad. It is one line in
`CaptureScreen`'s `need()` list and one in the schema.

## Postings — an officer can hold more than one territory

`User.territoryId` was a single column, which could not say the thing that
actually happens: a territory is left unstaffed and the officer next door picks
it up. That is not an edge case to model around — it is how a vacancy is
survived until somebody is posted — and until `TerritoryPosting` existed the
only way to record it was to leave the patch showing nobody at all.

**Two kinds, because there are two facts.**

| | |
| --- | --- |
| `BASE` | Their own patch. Exactly one. It is what "an officer's territory" meant everywhere the product used to say that. |
| `COVER` | Held while that patch has nobody based in it. Any number. |

A plain many-to-many would have recorded them identically, and the coverage
board would then show Rajshahi with "an officer" — describing a vacancy as a
full staffing. The kind is the whole reason this is a table and not a join of
two ids.

### What each surface does with it

- **Coverage board** — a patch with nobody based in it reads **Vacant**, with
  *covered by Rakib Hasan* underneath. It still counts toward "territories with
  no ARO", because a covered vacancy is still a vacancy. Once somebody is
  posted there the row becomes their name, *+ 1 covering*.
- **Intake forms** — the capture, the capture request and the off-road case all
  offer this officer's own patches and nothing else, base preselected. See
  *The territory dropdown shows only theirs*, below.
- **Capture windows** — a window scoped to a territory now reaches anyone who
  holds it, cover included. A window opened for a vacant patch that did not
  reach the person covering it would be a window opened for nobody.
- **Recovery Manager part filter** — an officer covering across the A/B line
  belongs to both halves and appears under either, but with only the postings
  that belong to the half being read.
- **Offers** — the line under a name is the patch they are BASED in. It says
  where a person belongs, not everywhere they are helping.

### The territory dropdown shows only theirs

An officer is offered **their own patches and nothing else** — base first, then
anything they are covering. A national list was the wrong shape for the person
filling it in: an ARO types one of two names, and scrolling past four they will
never pick is four chances to pick the wrong one.

Narrowing it also makes the control carry information. One entry is not a
choice, so it is stated rather than offered (*"Your territory."*); two means the
second is a patch they were handed, and the form says which (*"Yours, and 1 you
are covering."*). The base is preselected, so the default is always their main
territory.

**One route decides it.** The capture form, the capture request and the
off-road case all read `/api/capture/options`, so the rule is applied once
there rather than re-decided by each of them — and none of them can drift into
offering a patch that is not this officer's to file against.

**The list is a courtesy; the guard is the control.** A browser can post
whatever it likes regardless of the options it was handed, so `territoryDenied`
runs in all three write routes, immediately after the schema parse and before
any write:

```
403  That territory is not one of yours. File against your own patch,
     or ask HQ to assign you the cover.
```

Super Admin is exempt from both the narrowing and the guard, and it is not a
loophole: an admin holds no posting, so "one of theirs" is an empty set and
every administrative entry would otherwise be refused. They administer every
territory, so they are offered every territory.

### The half nobody remembers

Picking up a vacant patch is a decision somebody makes deliberately. Putting it
down again is a thing that should have happened the week the new officer
started, and there was never anything on any screen that would say so.

`spentCovers()` derives it: a cover on a territory that now has a based officer
is spent. The users console leads with it —

> **1 cover can be released** — Rakib Hasan is still covering Rajshahi, which
> Imran Kabir is now posted to.

Derived rather than stored, so the moment an admin posts somebody to Rajshahi
every cover on Rajshahi becomes spent, on every screen, with no second record to
update. Nothing is revoked automatically: releasing somebody is a decision, and
the console only points at it.

### Migration, in this order

`prisma db push` drops a removed column and everything in it, so the backfill
has to run *between* adding the table and dropping `territoryId` — afterwards
there is nothing left to read and every officer silently loses their patch.

```bash
# 1. add TerritoryPosting to the schema, keep territoryId
npx prisma db push
# 2. convert the column into BASE postings
npx tsx prisma/backfill-postings.ts
# 3. remove territoryId from the schema
npx prisma db push
```

## The part filter governs the whole page

The recovery organisation is split in two, each half with its own manager and a
head above them who reads both — so every Recovery Manager surface can be
narrowed to one half in one press.

On the three queue surfaces that always meant the whole screen, because a queue
is one list. On the **dashboard** it used to mean only the territory table: the
six headline tiles and the exception rows kept reading nationally, on the
argument that an approval rate belongs to the desk rather than to a territory.
In practice that produced a screen whose header answered one question and whose
table answered another, with nothing on the page saying which was which.

It now scopes everything. Choosing Part A re-derives the tiles, every exception
row and the table from Part A's records alone.

**Re-derived, not adjusted.** `scopeManagerBook()` filters each collection on
the territory its records belong to and then runs `deriveManagerMetrics()` over
what survives — the same function `getManagerBook()` calls on the whole book.
A scoped figure and a national one are one calculation over different rows, so
they cannot drift. The demo data reconciles exactly:

| | Off road | In resale | Accident | Thana | Past window | Approval |
| --- | --- | --- | --- | --- | --- | --- |
| Part A | 5 | 7 | 2 | 1 | 2 | 100% |
| Part B | 4 | 5 | 1 | 2 | 1 | 0% |
| **Both** | **9** | **12** | **3** | **3** | **3** | **50%** |

Every additive column sums. The approval rate deliberately does not — 100% and
0% over one request each is 50% over two — which is the clearest evidence that
it is computed rather than apportioned.

**The counts on the control stay national** (6 · 3 · 3). They are what tells the
manager how much of the field each press would show them, and a count that moved
with the selection could never answer that.

### Why there is a `recoveryRollup` module

The console narrows the book **in the browser**, from the page it was already
sent — so the press answers immediately, exactly as the queue surfaces beside it
do, with no second read. That means the derivations have to be reachable from a
client component, and `lib/recoveryDesk.ts` imports Prisma.

So the pure half — the part predicate, the metrics and the territory roll-up —
lives in `lib/recoveryRollup.ts`, which has no database under it. `recoveryDesk`
imports from it, never the other way at runtime.

One trap worth recording: `recoveryRollup` type-imports its row shapes back from
`recoveryDesk`. That edge is erased at runtime, and TypeScript is perfectly
happy with it — but a `export { … } from "./recoveryRollup"` *re-export* placed
in `recoveryDesk` runs back across that cycle, and Turbopack refuses to resolve
it in the RSC graph (`Export summariseByTerritory doesn't exist in target
module`) while `tsc` reports nothing. Import these from `@/lib/recoveryRollup`
directly; do not re-export them through `recoveryDesk` for convenience.

## At rest, the rail is a suggestion

Auto-hide's whole promise is that the nav gets out of the way — and a
full-height slab of saturated navy at the edge of every screen was not out of
the way. It was the loudest object in the product, permanently, for a panel
nobody was looking at.

So the **shut auto rail dissolves**. The navy drops to a breath of itself and
fades downward into the page; the dot field goes; the tiles lose their plates;
the ink flips from white-on-navy to ink-on-paper. On approach the panel
*develops* back into the solid object it always was. Nothing is hidden and
nothing moves — it is the same panel at a different weight.

**The thesis**, and the reason this is a redesign rather than an opacity value:
at rest the rail shows you only **where you are**, not everywhere you could go.
The current page keeps a real tile — accent-soft, with the accent tick at the
screen's edge — and every other glyph recedes to a stroke of ink. A shut nav's
job is orientation; navigation is what opening it is for.

That holds because of something the mode's own mechanics guarantee: the resting
state is **only ever on screen while the pointer is away and nothing in it is
focused**, since either opens the panel. It is a display, never an interface, so
it owes legibility at a glance and nothing else.

Three exclusions, each load-bearing:

| | |
| --- | --- |
| `(hover: hover)` | A touch laptop degrades auto to a plain rail that never opens, so it must stay solid — a ghost you cannot summon is a broken panel. |
| `:not(:hover):not(:has(:focus-visible))` | The open panel is untouched. |
| `prefers-contrast: more` | A reader who has asked the system for contrast gets the slab back. The dissolve is a luxury; legibility is not. |

Two implementation notes worth keeping. The wash lives on `.side::before`
rather than as the panel's `background-image`, because a gradient cannot be
cross-faded against the `none` the open panel carries — it would snap out while
the navy was still arriving; opacity on its own layer cross-fades cleanly.
And the colour transition is slightly longer than the width change it
accompanies (0.34s against 0.26s), so the ground is still arriving as the width
settles, which is what makes it read as one material thickening rather than two
properties animating side by side.

Inactive glyphs sit at `--ink-3` on paper — 3.26:1, clear of the 3:1 a non-text
control needs — and every one still carries its native tooltip.

## The desk top bar

The desk surface had no bar, and the space was not empty — it held the ACI mark,
alone, in a row nothing else justified. `DeskTopBar` does not add chrome; it
gives that mark a home and earns the row with three things the **side panel is
bad at**:

| | Why it is here and not in the panel |
| --- | --- |
| **Where you are** | Auto-hide is the panel's default mode, so most of the time the nav is a 64px rail of unlabelled glyphs and nothing else on screen names the current page. `pageTitle()` also answers for routes the nav never listed — a vehicle file, the capture form, the intake chooser. |
| **Search** | Ctrl+K already worked; its only visible affordance was at the foot of a panel that is shut by default. A shortcut nobody can see is one only its author uses. |
| **Desk load** | One number: files waiting on this desk, counted from `inboxStatusesForRole` — the same transition table that decides what the role may do. The badge and the queue it links to read one definition of "yours" and cannot drift apart. |

Two roles get **no badge, correctly**: the Super Admin holds no desk (no
transition names them — they may run any action but never owe one), and a
portal viewer cannot act at all. Putting a number in front of somebody implies
they owe something.

**Identity is deliberately absent.** The account tile and sign-out live in the
panel's foot, one hover away; a second copy would put one control in two places
— the thing the mobile bar was reorganised to stop doing.

**No state.** Sticky, a hairline, no scroll listener — nothing in it can get
stuck in the wrong state because it holds none, the same argument the auto-hide
panel makes for being pure CSS.

It publishes `--shell-top`, exactly as the field shell does. The marketplace's
filter rail has always stuck to that variable and resolved it to `0` on the
desk; it now follows this bar down instead of parking behind it, without the
rail knowing the bar exists.

Under pressure it sheds from the right inward, in order of worth per pixel: the
date, then the "on your desk" label leaving the bare count, then the Ctrl+K hint
and the search label leaving the magnifier. *Where you are* never goes — it is
the reason the bar exists on a shell whose nav is collapsed by default.

## Routes, not tabs

Both surfaces navigate through the shell, not through in-page tab strips. A
tabbed dashboard meant nothing was linkable, the browser's back button did
nothing useful, and — on the phone — a second navigation bar sat directly under
the bottom one.

**Recovery Manager** (sidebar): `/dashboard` · `/capture-requests` ·
`/credit-notes` · `/offroad` · `/letter-watch`. Four jobs, four addresses; the
dashboard reads rather than transacts.

**ARO** (bottom bar, 4 items — the cap is 5): `/dashboard` · `/captures` ·
`/offroad` · `/register`. Filters live *inside* a screen; they never navigate.

## The ARO panel

- **Dashboard** — what needs you now (flags from the desk, approved requests,
  letters due, cases past their window), your four figures, and one-tap access
  to all four intakes.
- **Captures** — Ready · Requests · Captured · In resale · Closed. Opens on
  **Ready** when HQ has cleared anything.
- **Off-road** — All open · Accident · Thana · Closed, worked directly from the
  list.

Lists are pre-sorted so the top of the screen is always the next thing to do: a
desk flag outranks a late clock (the clock is a fact, the flag is a person
waiting), then overdue, then by time remaining.

### The request tabs are a waiting room and a record, not one list

`Requests` used to hold every request that was not approved: refused ones,
withdrawn ones, and the ones whose approval had already been spent taking a
vehicle. So the tab an officer opens to see whether HQ has answered them was
mostly answers from weeks ago, and the count beside it was a number to read
past rather than act on.

Every one of those states has somewhere better to be, and the split is along
what the officer can do about it:

- **Awaiting** — `PENDING` only. One question: what is HQ still sitting on.
  It is the only one of the four with a control on the card, and the control is
  *Withdraw request*.
- **Ready** — `APPROVED`. A permit, with its own card. See above.
- **Declined** — `DECLINED` and `WITHDRAWN`, newest first, because this is a
  history and the useful end of a history is the recent one. Two different
  endings — HQ refused, or the officer pulled it because the customer paid —
  and the card states which, so the tab does not have to. What they share is
  the only thing the tab is for: the file is closed and no vehicle came of it.
  No withdraw button: there is nothing left to pull, and offering the control
  would be offering an action that can only fail.
- **Captured** — a spent approval is not paperwork any more, it is a vehicle.
  It appears as the thing itself, in the tab that holds the officer's live
  files, and not a second time as the request that asked for it.

Withdrawn requests are kept rather than dropped. Dropping them would make an
officer's own retraction vanish from their screen the moment they made it,
which is the one outcome they are most likely to go back and check.

### An approved request is a permit, not a request

A pending capture request and an approved one look identical on a list and are
not the same object. A pending one is a **question the officer asked** and is
waiting on somebody else to answer. An approved one is a **job they have been
given** — HQ has ruled, and the vehicle is now theirs to go and take.

The Captures tab used to hold both in one **Requests** list, with the approved
ones sorted to the top. Sorting is not a distinction: it left the only
actionable thing on the screen looking like the three things that were not, and
it put the officer's next job behind a tab labelled with what they had already
done. The ARO dashboard has always carried an *"Approved — go and capture"* row
pointing here; the destination did not keep that promise.

So approved requests now have their own first tab, **Ready**, and the screen
opens on it whenever it has anything in it. `ReadyCard` is a separate component
from the request card rather than a variant of it, because almost everything the
request card carries belongs to the *asking*: decision history, the withdraw
button, the expected-outcome disclosure. The officer is about to stand next to
this vehicle. What they need is which one, whose, where, and one button.

The account position survives that cut — as **one line of mono**, not a form:
instalments overdue · overdue amount · outstanding. It is the answer to the
question the customer asks at the roadside, and an officer who cannot give it is
an officer arguing from memory. It wraps rather than scrolls, because a
horizontal scroller inside a card on a phone is a figure somebody will miss.

**The card is jade, and never the accent.** The accent is *"the current thing"*
everywhere else in this product; a permit is not where you are, it is where you
have been told to go. The jade band across the top is the only one in the field
panel, and it states the two facts the officer has not been told elsewhere: that
they are cleared, and how long the clearance has been standing.

**A permit nobody has acted on says so.** At three days the card grows an ochre
strip — *"Still on the road N days after approval."* Ochre, not red: a vehicle
being hard to find is not a failure, and colouring it as one would teach
officers to ignore the colour that means something has actually gone wrong.
Nothing else on any screen would ever mention it: the desk sees a request it
ruled on weeks ago, and the officer sees a list that looks the same on day one
and day thirty.

The **Requests** tab keeps pending and declined — the conversation with HQ —
and its count badge now counts only what is genuinely waiting on a decision.

### Texture has to be readable, or it is just texture

The summary slab carried a tyre-track watermark running corner to corner under
the figures. What it was actually doing was covering an empty right-hand half:
the headline sat on the left and nothing sat beside it, and a watermark is the
cheapest way to stop that reading as unfinished. That is decoration hired to
solve a layout problem, and it is the thing that dates a screen fastest.

It is gone, and the space it was hiding now carries two readings:

- **Longest off road**, right-aligned at a third of the headline's size, with
  the registration under it. The headline says how *many*; this says how
  *long*, which is the question a manager asks about the first one and the one
  thing no list on the officer's phone could answer — every list here sorts by
  what is due next, so a vehicle nobody can move sinks to the bottom and stays
  there. One clock spans both record types (a seizure dates from its capture, a
  case from the day it happened) because "off the road" is one idea, and
  splitting it in two would be reporting our own filing rather than the yard.
- **The headline, drawn to scale.** A three-segment bar sized by `flex-grow` on
  the counts themselves, in the order of the three cells directly beneath it —
  so the bar is not a graphic *about* the number, it is the number, and the
  labelled row underneath is its legend. Proportions cannot drift from the
  figures, and a category at zero takes no width rather than needing a case.
  Monochrome, three values of white: the slab already carries the house
  gradient at full strength, and a second palette on top would be the panel
  arguing with itself.

The slab is four material layers now instead of five, and every one of them is
still doing something — gradient, dot lattice, sheen, caught top edge.

### Density, not size

The rest of the pass buys information with millimetres rather than with height.
The screen is about 45px **shorter** than before.

**The record card is three readings where it was two and a lot of air** — all
time · last 30 · prior 30, at the same card height, divided by hairlines rather
than gaps: a gap between numbers reads as three separate facts, a rule reads as
one series measured three ways. Three raw figures rather than one figure and a
percentage, because the percentage cannot be computed when the prior window is
empty, and a comparison that silently disappears is worse than two numbers the
reader can compare themselves. The trend badge still appears when there is a
prior window to compare against.

**The intake tiles are three across, not two.** Two columns left the third tile
alone beside an empty half — the most visible dead space on the screen, and the
kind of thing that makes a product look unfinished however good the card above
it is. Three chips fill the row, end the section on a straight edge, and cost
about 40px less. The layout turns the corner to manage it: the plate moves above
the label and the sub-line is dropped, which is the right trade on the one row
where all three labels already say exactly what they do. Below 340px they stack
back into full-width rows and the sub-line returns with the room to hold it.

**Section headings carry a rule out to their count.** A rule *under* a heading
draws a line across the screen and cuts the page into slabs; a rule running
*out* of the heading to meet its count ties the two ends of the row together
and leaves the page whole — and stops the count reading as a stray numeral at
the right margin. It is a pseudo-element ordered between the two children,
which is also why it targets the count by `nth-child(2)` rather than by
`:last-child`: with no count present, `:last-child` matched the heading itself
and pushed it to the right-hand margin.

### The premium pass — softer material, quieter colour, one accent

A restyle toward a calmer, Apple-ish surface. Nothing structural moved; what
changed is how firmly the panel states what it already said.

**The slab runs blue into green, with the violet taken out.** The ramp was
blue → indigo → violet → teal → green, which put its most saturated and least
natural stop dead centre: the eye reads that as a third colour laid *over* the
other two rather than as one surface travelling. Blue to green through teal is
the same journey with the argument removed — adjacent hues, one continuous
shift — and it leaves the figures on top as the only high-contrast thing on the
panel.

**The whole field panel's accent follows it, from one override.** Once the slab
stopped running through violet, every accent surface around it — the dock's
centre action, the active tab, the tab pills, the primary button on a capture
card — was still indigo, and an indigo button under a blue-to-green panel reads
as a screen assembled from two products. The accent is a token set, so it is
retuned once in `.shell-mobile` rather than in forty rules that would drift.
The desk consoles keep the product's indigo; nothing here reaches them.

> This turns the **Service Engineer and Sales phone panels blue too**. They
> share this shell, and one field role in a different accent from the other two
> is not a theme, it is a bug nobody filed.

**A composed token does not follow its parts.** `--grad-accent` is declared on
`:root` as a ramp between `--accent-2` and `--accent`, and a custom property's
`var()` references are substituted where it is **defined**, not where it is
used — so it inherited into the field panel as a literal indigo gradient and
ignored the override entirely. The primary button stayed violet on a blue panel
with nothing in the cascade to explain why. Anything built *from* the accent
has to be rebuilt beside it.

**The alert badge is a tint, not a block.** It used to invert — solid saturated
fill, white numeral — which on a screen of white cards gave three of four rows
a hard coloured dot and turned an exception into the list's normal state. The
tint is simply stronger than a calm row's and the numeral darker; the pulse
still marks what is genuinely late. The hue was always the part carrying the
meaning, and the fill was volume.

**Radii, plates and rows, all one step softer.** 20px cards rather than 16–18
(a radius reads as a squircle at roughly an eighth of the card's height, and
every card here is short); plates at 11px so they belong to the same family of
shape as the card holding them; tints at 11% so the drawing is the colour and
the plate is the surface it sits on; rows at 11px of padding, which is what a
list needs to read as settled rather than packed. The shadow lost its weight
and kept its spread.

**Small pieces that had no surface of their own.** The slab's label now begins
with a mark instead of floating at the padding edge; the registration under the
longest-off-road figure sits in a chip, because small mono at 58% white on a
moving gradient is a smudge; the Credit-Note footnote sits on a translucent
strip with the glyph that means "aside", so it is findable without being
louder. And the longest-off-road block is now a **link** — it names one
specific vehicle, so it goes to the book that holds it (captures for a seizure,
off-road for a case), because a named thing you cannot tap is a dead end.

### Visual rules for this panel

The field panel runs a **louder palette than the desk consoles**, and that is
deliberate. A manager reads a dense table under office light and needs the data
to be the only loud thing on screen. An ARO reads this at arm's length,
one-handed, in a yard, often in sunlight — where an 8% tint is white. Colour is
what makes a category recognisable before the words are legible.

**White cards on a soft grey ground, with one deep indigo block.** The panel
used to be white cards on a white page, so every card needed a visible border
to exist at all — and a screen full of hairline rectangles reads as a form
rather than a product. Tinting the page instead lets a card be defined by being
*lighter* than what is behind it, which is how paper works, needs no border,
and leaves the only strong lines on the page for things that mean something.

**Colour is carried by the illustration plates, not the cards.** A tinted card
competes with the card beside it; a white card with a coloured plate in its
corner does not, and the plate is where the eye lands anyway. The single
exception is the headline figure — how much of the book is not earning — which
runs white on deep indigo because it is what an officer orients on when the app
opens. No blur, no translucent plates stacked over each other.

**Illustrations, not glyphs — professional flat, not illustrative.** Every card
and tile in this panel carries a small vector drawing from
`components/aro/Art.tsx`. A monochrome stroke icon borrows its meaning from
whatever is tinting it, so it says nothing until you have already read the
label; at 16px single-weight in daylight it is a smudge.

The house rules that keep these from turning into a sticker set: filled
geometry only, no strokes or motion lines; one hue in two or three values plus
at most one accent shape *where the accent is the meaning* (the beacon on a
station, the fracture on a damaged wing); nothing tilted; square-on elevations
rather than three-quarter views, because an elevation is what a technical
drawing uses and it survives being shrunk.

**Motion: two loops, both earned.** The summary block's gradient drifts over
18 seconds — deliberately at the edge of perception, so you notice it after
glancing away and back rather than while looking at it. And the count badge on
a genuinely *late* row pulses a soft ring every 2.4s, which is the one place
movement should mean "this one" rather than "this app has animations".
Everything else is entrance and response: a staggered rise on arrival, a 0.985
press scale, counters that count up. All of it off under
`prefers-reduced-motion`.

The pulse is built from `box-shadow`, not a pseudo-element behind the badge:
a `z-index: -1` child paints behind the nearest stacking context's background,
which here is the white card, so the first version rendered correctly and was
covered up.

**Lists are one card, not many.** The attention list was four separate tinted
cards — four shadows, four sets of margins, ~40px of screen spent on the gaps
between things that belong together. One card with hairline-divided rows is the
same information, ~90px shorter, and it finally reads as a list.

**No coloured left borders.** That marker was doing the same job on four
unrelated surfaces across the product, at which point it had stopped being a
signal, and on a phone it ate 3px of an already narrow card. Urgency is now a
flat tinted strip across the top of the card — which can also say *what* is
wrong rather than only that something is.

**Colour is never decoration.** A surface is tinted only when the tint is the
information.

## The Service Engineer's bench

**Built from the officer's panel, not merely to match it.** The two field
surfaces had always claimed to share a design language and had been saying it
with two separate implementations — a violet bench hero beside a blue-green
recovery slab, a scrolling rail of tinted count chips beside an inset-grouped
attention list, a five-segment gauge beside pill tabs. Three pieces of bespoke
design for jobs the officer's panel had already solved.

The bench is now the same four blocks in the same order: greeting, summary
slab, attention list, tabs. What differs is the content, because the work does.

**The slab carries figures now, so it needs nothing drawn on it.** It used to
hold a greeting and a measuring-instrument illustration, and the instrument was
there to fill a block with no numbers in it — the same bargain the officer's
tyre-track watermark made, and the same trade to unwind. It reads:

- **On the bench** — assess + review + repair, which is what the engineer is
  actually holding. Cleared work is counted in the row below but kept apart; it
  has left their hands, on the same rule the officer's panel uses for resale
  stock.
- **Longest on bench** — the oldest file still in hand, with its registration,
  and tapping it jumps to the bucket that file is in. The headline says how
  many; this says how long, and every queue on this screen is sorted by what is
  due next, so the oldest thing sinks quietly to the bottom of one of them.
- **The bar** — assess / review / repair at their true proportions, the three
  cells beneath it drawn to scale.
- **The value on the bench**, on the note strip. It is the figure a Service
  Manager asks about and the engineer had nowhere to read.

**The attention row became a list.** Five counts in a horizontal scroller is a
legend, not a queue: a chip has room for a number and one word, so it can say
*what is wrong* and never *what to do about it* — and the least urgent item is
the one that falls off the end where nobody looks. The rows now carry both
("Waiting on parts / Blocked until the part arrives"), the whole row is the
target, and a genuinely late one still pulses.

**The five-segment gauge became pill tabs.** Its figures had moved into the
slab, and a panel that reports the same five counts in two places is the tiles
-and-pills duplication this file removed once already. The one thing it owned —
that "My month" is a record rather than a queue — survives as `AroTab.count`
being optional: a tab with nothing to count shows no count, because a `0` there
reads as an empty bucket and sends somebody looking for work that was never
missing.

Two side-effects worth keeping: `.card` inside `.aro-page` now takes the
panel's 20px radius, since the bench's work cards are built on the shared card
and a screen whose summary block is 20px above 18px work reads as two screens
stacked; and an empty segment is no longer rendered on either panel's bar — the
segment carries a `min-width` so a thin sliver stays visible, which on a count
of zero drew a stub of a category that is not there. The officer's panel had
the same bug and had simply never met a zero.

About 360 lines of bench-specific CSS went with the markup it styled.

### A repair report only goes forward

A stage is a statement about a physical vehicle — work has begun, parts are
missing, it is finished — and un-saying one is not a correction, it is a
different claim about the past. The audit trail already holds every report ever
filed, so "I marked it wrong" is answered by filing the right one **next**, not
by winding the control back. Left reversible, the stamped `repairStage` on the
row stops being a record of progress and becomes a record of whatever was last
tapped.

**The ratchet is on `step`, not on the order of the buttons**, and that
distinction is the whole design:

| | step |
| --- | --- |
| Not started | 0 |
| In progress | 1 |
| **Awaiting parts** | **1** |
| Ready | 2 |

`AWAITING_PARTS` is a state of the in-progress phase, not a step past it, so
moving between those two is **sideways**. A naive left-to-right ratchet would
let an engineer report that parts are missing and then refuse to let them say
the parts arrived — locking the one transition that happens most often in a
workshop, and teaching them to stop filing progress at all. Forward is allowed,
sideways is allowed, backward is refused.

A passed stage is **shown, not hidden**: it stays in place, struck through,
with a padlock where the tick would be. The rail is a record of the route as
much as it is a control, and a stage that vanishes once passed leaves an
engineer wondering whether they ever filed it. It is quieter than a plain
`:disabled`, because a merely dimmed control reads as "not ready yet" — the
opposite of what this one means.

**The confirmation gates the forward step only.** That step cannot be taken
back, so it is worth a question; a sideways move is reversible by definition —
both directions are legal — so asking about it would be a dialog with nothing
at stake on the one screen whose whole design is that filing a report costs a
single tap in a workshop. The dialog names **both ends** of the move, because
what is being confirmed is the move and an engineer who mis-tapped notices by
seeing the stage they are about to leave. `READY` has no dialog: the finish
step already asks for the five handover photographs, which is a larger
commitment than a dialog and answers the same question.

Enforced in `/api/vehicles/[id]/progress`, not only in the control — the pills
the browser was handed have no authority over what it later posts.

### An approved repair reads as under way

A repair reaches the bench because the Service Manager approved it and set a
deadline — the clock is already running — so a control sitting blank until
somebody discovers it is starting from the wrong place. An unreported live
repair therefore shows **In progress** (`currentStage`), derived rather than
written at approval time: the Service Head's transition has enough to do, and a
default living in one function cannot be half-applied to rows that already
exist.

**All four stages stay on the control, `NOT_STARTED` included.** "This was
approved and I have not been able to start it" is exactly what a Service
Manager needs to hear early, and it is the one report a deadline cannot make
for itself.

**A default is a suggestion until it is confirmed**, and that is what keeps it
compatible with the ratchet. The control shows the derived stage; the ratchet
reads the raw column. On an unreported repair those differ on purpose —
nothing has been claimed, so every stage is open, and the engineer can correct
the default down to "not started" if that is the truth. The ratchet begins to
bind at the first real report, which is the first moment there is a statement to
be stuck with. Ratcheting from the displayed default would refuse the one
report the default might be wrong about.

### Blocked has two causes

Parts are the common one, which is why the stage is named after them — but a
repair also stops for a lift nobody can free up, a specialist who has not come,
an authorisation that has not landed. Those were being filed as "awaiting
parts" because it was the only way to say *stopped*, which quietly turned the
one figure a Service Manager chases — how much of the workshop is waiting on the
parts desk — into a lie.

Tapping the blocked pill now asks **what it is waiting on**: *Waiting on parts*
or *Other issue*, two tap-target cards rather than a radio pair, because the
choice is made one-handed next to a vehicle. `OTHER` requires the note — "something
else is wrong" is not a report — and the button stays disabled until there is
one. The pairing is enforced in `repairProgressSchema`, so the rule travels with
the shape rather than living in the route.

Three consequences worth knowing:

- The blocked pill **shows the reason**, not the stage: a repair stopped by a
  missing lift reads "Other issue", because a pill saying "Awaiting parts"
  there is the label doing the opposite of its job.
- Tapping it while it is already current **re-opens the dialog**. Changing what
  a job is waiting on is a new report even though the stage has not moved, and
  the audit trail records it as one — "Waiting on parts → Other issue" rather
  than a stage repeating itself.
- `repairBlocker` is **cleared** when the repair moves on. A stale "waiting on
  parts" left on a finished job is the kind of field that makes a whole board
  untrustworthy.

### Signing in once is signing in

The session is 60 days and rolling: `updateAge` re-issues the token a day at a
time, so somebody who opens the app most weeks is never signed out, while an
account that goes quiet for two months stops being a live credential sitting on
a phone in a yard. A session that never expires at all is not a convenience, it
is a lost handset.

What actually changed for the field roles is that the cookie is now
**persistent** — written with an expiry rather than for the life of the browser
process — which is what ends a session on a phone when the OS reclaims the tab.
Re-issuing the token is also what picks up a territory reassigned in the admin
console without the officer signing out and back in.

### Back goes back

`router.back()` is one of those calls that works every time you test it and
fails for the person who matters: it walks the BROWSER's history, not the app's,
so it only does what the word says when there is somewhere in this app to go
back to. When there is not, it does one of three things, none of them "go back":

| | |
| --- | --- |
| Installed to a home screen | the app is its own window with one entry, and back **closes it**. This product ships `display: standalone`, so for the field roles this is the normal case, not an edge one. |
| A shared link | back leaves for whatever was on screen before. |
| A new tab | nothing happens, which reads as a dead control. |

`components/ui/BackLink` counts instead. Every in-app navigation records the
path in `sessionStorage` — per tab, cleared with it — and back is a history move
only when that trail says there is an app page underneath. Otherwise it goes to
the parent route, which is the honest answer to "back" on the first page you
were shown: not the previous website, and not nothing.

**It counts PATHS, not calls**, and it has to. React runs effects twice in
development, so a plain `depth + 1` recorded two entries for the first page of a
fresh tab — which made `depth > 1` true with nothing behind, so Back called
`router.back()` on the opening page and landed on `about:blank`. Precisely the
trapdoor the module exists to close, reintroduced by the counter meant to detect
it. Storing the last path makes the count idempotent whatever re-runs the
effect. `sessionStorage` rather than `history.length` for the same reason:
`history.length` counts entries from before the app was opened, so a phone
browser with a long history says "yes, go back" and leaves the product.

The vehicle file's breadcrumb uses it. It read `Dashboard ›` and went there,
which is almost never where the reader came from — they opened the file out of a
queue they had scrolled, filtered and chosen a tab in, and the breadcrumb threw
all of it away.

### A sold as-is file leaves the bench

`REPAIR_APPROVED` means two different things and only one of them is a repair.
On an as-is file the Service Manager authorised no work, and it sits in the
engineer's queue for one reason: to **tell** them, plainly, that a vehicle they
were assigned is being sold in the state it arrived in. Hiding it while that is
still news would leave a file quietly vanishing, which is how somebody ends up
starting work on it anyway.

Once it is sold, that news has been delivered and overtaken. It cannot come
back, there is nothing to photograph, nothing to estimate and nothing to
report — it is a row the engineer reads past every time they open the bench,
for the rest of the vehicle's life. So it goes.

**A repaired vehicle that sells is the opposite case and stays.** "Cleared" is
the record of work this engineer actually did. An as-is file records no work,
so once it is sold there is nothing about it that is theirs.

Both markers are checked — `soldAt` is the sale itself, `status` is where the
file sits. They are written in the same transaction, but a queue that empties
only when two independent columns agree is a queue that will one day not empty.

The route refuses progress reports on an as-is file for the same reason: the
card never renders the control, and the control not being drawn is a courtesy
to the browser rather than a rule.

## The HQ console

Full-bleed, dense, and row-based. `ConsolePage` sets the frame: no reading-width
cap, because these pages are wide tables and a `max-w` container was throwing
away 300–500px of the monitors they are actually read on.

**Rows, not cards.** A card is right on a phone, where one record fills the
screen and the officer is acting on it. At a desk a supervisor is *comparing*
thirty records, and comparison needs columns that line up — the card layout put
every figure at a different x-position. `CaseListRow` and `RequestListRow` are
the desk versions; the cards are unchanged and still serve the field.

**Territory analytics** (`summariseByTerritory` → `TerritoryTable`) crosses the
segments: read down a column to rank territories, across a row to see what kind
of trouble one is in. Grouped headers (Load / Needs attention / Age), sortable
with `aria-sort`, tabular figures, one inline bar on the headline column only,
and exception columns that stay silent at zero.

## Architecture

- **`src/lib/rbac.ts`** — roles, the surface each role is built for, and the **state
  machine**: a single `(fromStatus, role, action) → toStatus` table that is the only
  thing allowed to move a vehicle. Every API route resolves against it.
- **`src/lib/session.ts`** — `requireUser` / `requireRole` guards for API routes.
- **`src/lib/audit.ts`** — every transition and edit is written to `VehicleEvent`.
- **`src/lib/costing.ts`** — total = repair + transport + other + registration + SOP.
- **`src/lib/offroad.ts`** — off-road vocabulary and the derived case countdown.
- **`src/lib/letterSchedule.ts`** — the letter ladder's due dates and the release lock.
- **`src/lib/recoveryDesk.ts`** — the reads behind the ARO panel, the Recovery
  Manager console and the `/offroad` register, so all three agree on what
  "overdue" means.
- **`src/app/(app)/`** — authenticated app; `AppShell` renders a desktop sidebar or a
  mobile bottom nav based on the signed-in role.

## Status of the build

Foundations are complete: data model, auth, RBAC/state machine, audit spine, design
system, role-aware shell, dashboard and the Marketplace. The eight desk
workflows (capture, CN approval, assessment, repair sign-off, registration, SOP,
pricing, GM approval) are built on top of these foundations.

Off-road intake — capture requests, accident and Thana cases, the letter
schedule and the `/offroad` register — is built and wired into the ARO panel and
the Recovery Manager console. The resale pipeline is untouched by it.

## Deployment

**[HOSTING.md](HOSTING.md) is the runbook** — cPanel setup, the environment, the
database migration and what to check afterwards, in the order it has to happen.

Builds to a standalone server (`output: "standalone"`). Four things that are not
obvious and cost something each time they are rediscovered:

- **`UPLOAD_DIR` must point outside the deployment directory.** Unset,
  photographs land in `./uploads` inside the release, and the next deploy that
  replaces that directory destroys every capture photo, repair estimate and
  handover shot in the system — records intact, images gone, no warning.
- **The release is packaged, not copied.** `zip_standalone.ps1` prunes three
  things the tracer puts in the standalone output: this machine's `.env` (which
  otherwise overwrites the server's on extract, pointing production at
  `resale_local`), the local `uploads/` folder, and orphaned Prisma engines — a
  `prisma generate` that cannot rename its temp file leaves a ~24 MB
  `.tmp<pid>` behind, and twenty-six of them once turned a 200 MB output into
  733 MB.
- **No server-side image optimisation.** `sharp` is a native binary and this
  release is built on Windows for a Linux host, so the traced copy cannot
  load — an `unhandledRejection` on every boot and a 500 from `/_next/image`.
  The two chrome marks are shipped at the size they are drawn at instead; see
  `images.unoptimized` in `next.config.ts`.
- **The schema migration has an order.** `prisma db push` creates
  `TerritoryPosting` and drops `User.territoryId` in one pass, so the postings
  have to be snapshotted first. `deploy/00-inspect.mjs` reports which steps a
  given database still needs; the scripts beside it are plain `.mjs` against
  `@prisma/client`, so they run on a shared host with no toolchain.

Secrets belong in the host environment, never in the repo — including in the
deploy scripts, which read cPanel credentials from `$env:` rather than carrying
them.
