# Payment Approval System — Architecture & Design Doc

## 1. The core decision: one database, two front doors

You don't have a desktop app yet, so this is the moment to avoid the classic mistake:
building two apps that each own their own data and "sync" afterward. Sync is where
these systems rot — race conditions, duplicate approvals, stale caches.

Instead: **one backend API + one database. The web portal and the future Windows
app are both just clients of it.** The Windows app (when built, e.g. in
Electron, WPF, or .NET MAUI) talks to the same REST API over the same network,
the same way the browser does. There is no "sync" step to build, because
there's only one source of truth. Offline use on the desktop app can be handled
later with a local cache + queued writes, but that's an optimization, not
required for launch.

```
                        ┌─────────────────────┐
                        │   PostgreSQL (RDS)   │
                        │  single source of    │
                        │  truth               │
                        └──────────┬───────────┘
                                   │
                        ┌──────────┴───────────┐
                        │   Backend API         │
                        │  Node.js / Express    │
                        │  (REST + JSON, JWT)   │
                        └──────────┬───────────┘
                 ┌─────────────────┼──────────────────┐
                 │                 │                  │
        ┌────────┴───────┐ ┌───────┴────────┐ ┌───────┴────────┐
        │  Web Portal     │ │  Windows App    │ │ Future Android/│
        │  (React, mobile │ │  (future,       │ │ iOS apps       │
        │  responsive)    │ │  same API)      │ │ (same API)     │
        └────────────────┘ └────────────────┘ └────────────────┘
```

This also directly satisfies "the architecture should support future Android
and iOS apps without major redesign" — those apps just become a fourth client
of the same API.

## 2. Stack recommendation

| Layer | Choice | Why |
|---|---|---|
| Database | PostgreSQL | Strong relational integrity for financial records, JSONB for flexible fields, great audit/reporting support |
| Backend | Node.js + TypeScript + Express | Fast to build, huge ecosystem, easy to host, type-safety matters for money fields |
| ORM | Prisma | Type-safe queries, painless migrations, schema doubles as documentation |
| Auth | JWT (short-lived access + refresh token), bcrypt password hashing | Stateless, scales across web + future mobile apps |
| File storage | S3-compatible object storage (AWS S3 / Azure Blob) | Supporting documents & attachments, never store binaries in Postgres |
| Email | Transactional email API (SES / SendGrid / Postmark) | Reliable delivery + tracking |
| WhatsApp (optional) | WhatsApp Business Cloud API (via Meta) or Twilio | Sending approval links |
| Frontend | React + Vite + Tailwind CSS | Fast, responsive-by-default, component reuse for future native apps' design language |
| Hosting | Any standard cloud (AWS/Azure/GCP) or a single VPS to start | HTTPS via managed cert (ACM / Let's Encrypt) |

You can substitute .NET/C# for the backend if your team is already a .NET shop
(pairs naturally with a future WPF/MAUI desktop app) — the schema and API
contract below stay the same either way. I built the starter in Node/TypeScript
because it's the fastest path to a working demo, but this is a swappable choice.

## 3. Data model (see `backend/prisma/schema.prisma` for the runnable version)

Key entities:

- **User** — id, name, email, password hash, role (`finance`, `manager`,
  `admin`), MFA secret (optional), active flag.
- **Outlet / Supplier** — reference data.
- **PaymentRequest** — request number (`PR-2026-000123`), supplier, outlet,
  invoice number, invoice amount, payment amount, currency, reason, status
  (`pending`, `approved`, `rejected`, `hold`), batch flag, created by, timestamps.
- **PaymentRequestLine** — for batch requests: one row per supplier/line item
  within a batch, each with its own amount, so totals can be computed.
- **Attachment** — file name, storage URL, mime type, linked to a request.
- **ApprovalLink** — the unique secure token issued per request
  (`/approve/PR-2026-000123?token=...`), expiry timestamp, used flag.
- **ApprovalAction** — one row per approve/reject/hold decision: approver,
  decision, remarks, timestamp, IP address, user agent (device/browser parsed
  from it), linked request.
- **AuditLog** — append-only log of every state-changing action in the system
  (login, view, approve, reject, hold, link generated, link expired, etc.),
  for compliance.
- **NotificationLog** — record of every email/WhatsApp sent, status, provider
  message id — so you can prove a notification was sent if disputed.

Financial amounts are stored as integer minor units (cents/fils) or
`Decimal`, never `float`, to avoid rounding errors.

## 4. Approval link security

1. Finance submits a request → backend creates the `PaymentRequest` row and a
   matching `ApprovalLink` with a cryptographically random 256-bit token
   (`crypto.randomBytes(32)`), stored **hashed** (like a password) in the DB,
   and an expiry (configurable, e.g. 7 days).
2. The link sent by email/WhatsApp is
   `https://companyname.com/approve/PR-2026-000123?token=<raw-token>`.
   The raw token is never stored — only its hash — so a database leak alone
   can't be used to forge approvals.
3. Opening the link still requires the approver to be logged in (or to log in
   at that point) — the link scopes *which* request you land on, it isn't a
   substitute for authentication. This stops a forwarded email from letting a
   stranger approve a payment.
4. Every link use is checked against expiry + "already used for a final
   decision" state, and logged in the audit log regardless of outcome.
5. All traffic is HTTPS-only; the server redirects/rejects plain HTTP.

## 5. Roles & permissions (RBAC)

- **Finance/Requester** — create payment requests, view own submissions, resubmit.
- **Manager/Approver** — see requests assigned to them, approve/reject/hold, view history.
- **Admin** — manage users, roles, outlets, suppliers, expiry policy, view full audit log.

Permissions are enforced server-side on every route (never trust the frontend), based on the JWT's role claim plus a per-request "assigned approver(s)" check.

## 6. API surface (representative, not exhaustive)

```
POST   /api/auth/login              email+password -> access+refresh token
POST   /api/auth/mfa/verify         (optional second factor)
POST   /api/auth/refresh
POST   /api/auth/logout

GET    /api/requests?status=pending|approved|rejected|hold
GET    /api/requests/:requestNumber
POST   /api/requests                (finance creates a request)
GET    /api/requests/:requestNumber/attachments/:id   (view/download)

POST   /api/approvals/:requestNumber/decision
       body: { decision: "approve"|"reject"|"hold", remarks }
       -> records ApprovalAction with IP/device/browser, updates status,
          triggers notifications

GET    /api/approvals/:requestNumber/history

GET    /api/audit-log               (admin only, filterable)
```

Every mutating route captures `req.ip`, `User-Agent`, and the authenticated
user id and writes an `AuditLog` row — this is what "digital approval record"
and "audit log for every action" require.

## 7. Notifications

A `NotificationService` fires on four events (submitted, approved, rejected,
hold) and is called from the same place the status transition happens — not
scattered across the codebase — so the two can never drift apart. Email is the
required channel (SES/SendGrid); WhatsApp is implemented behind the same
interface so it's an additive channel, not a rewrite, when you're ready to
enable it.

## 8. Mobile-responsiveness & future native apps

The web portal is built mobile-first with Tailwind (single-column stacked
layout under ~640px, table view above it). Because it's just a consumer of the
REST API with no server-side rendering coupling, a React Native or native
Swift/Kotlin app later can reuse the exact same endpoints and auth flow — no
backend changes required, only new clients.

## 9. Suggested build order

1. Auth + roles + DB schema (this starter includes it).
2. Payment request creation (Finance side) + approval link generation.
3. Approval screen + approve/reject/hold + audit log (this starter includes a working version).
4. Notifications (email first, WhatsApp optional).
5. Dashboard with filtering/search + batch request table view.
6. MFA, configurable link expiry policy, admin user management.
7. Desktop app as a second client of the same API.
