# BK Sales Dashboard

Internal sales analytics dashboard and automated monthly report export for
**Blue Karma Group** (Bali hospitality). Replaces a manual ~60-slide monthly
"Sales Highlight" PowerPoint with an interactive dashboard.

See [`CLAUDE.md`](./CLAUDE.md) for full business context, conventions, and the
phase roadmap.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Recharts ·
Prisma on self-hosted PostgreSQL · SheetJS (`xlsx`) · lucide-react.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure the database (local PostgreSQL)
cp .env.example .env      # then set DATABASE_URL + DIRECT_URL to your local Postgres
npm run db:generate       # generate the Prisma client
npm run db:migrate        # create + apply the initial migration
npm run db:seed           # seed properties + BKDS June 2026 demo period
npm run db:verify         # sanity-check: prints a derived example

# 3. Run the dev server
npm run dev               # http://localhost:3000
```

Set `DATABASE_URL` and `DIRECT_URL` to your local PostgreSQL
(`postgresql://<user>:<pass>@127.0.0.1:5432/<db>?schema=public` — both the same
for a plain local Postgres). See `.env.example` and
**[`DEPLOY.md`](./DEPLOY.md) §1** for creating the role + database + grants.

## Scripts

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start the dev server                 |
| `npm run build`      | Production build                     |
| `npm run start`      | Start the production server          |
| `npm run lint`       | ESLint                               |
| `npm run typecheck`  | `tsc --noEmit`                       |
| `npm run test`       | Vitest (calculation unit tests)      |
| `npm run format`     | Prettier                             |
| `npm run db:generate`| Generate the Prisma client           |
| `npm run db:migrate` | Create + apply a versioned migration |
| `npm run db:seed`    | Seed properties + demo period        |
| `npm run db:verify`  | Read demo data back + derived example|
| `npm run db:studio`  | Open Prisma Studio                   |
| `npm run db:create-admin` | Bootstrap the first ADMIN user  |

## Database

Self-hosted PostgreSQL for all environments — a local Postgres instance on the
VPS, no external service. Prisma uses two URLs, `DATABASE_URL` (runtime) and
`DIRECT_URL` (migrations); for a plain local Postgres they're identical. See
`CLAUDE.md` for details. Apply all migrations with `npx prisma migrate deploy`.

## Auth & roles

Auth.js (NextAuth) with email/password + optional Google SSO. Roles: **ADMIN**
(full access, mark final, manage users), **EDITOR** (import + edit assigned
properties), **VIEWER** (read-only + export). Protection turns on when
`AUTH_SECRET` is set — until then the app stays open. Manage users in
**Admin → Users**; see the activity trail in **Admin → Activity**.

## Deployment

Production target is a **self-hosted VPS** (Ubuntu + local PostgreSQL + Caddy),
running everything on one box — no external database or storage. Full
step-by-step (DB setup, env vars, migrations, auth, HTTPS, PDF, QA checklist) in
[`DEPLOY.md`](./DEPLOY.md).
