# BK Sales Dashboard

Internal sales analytics dashboard and automated monthly report export for
**Blue Karma Group** (Bali hospitality). Replaces a manual ~60-slide monthly
"Sales Highlight" PowerPoint with an interactive dashboard.

See [`CLAUDE.md`](./CLAUDE.md) for full business context, conventions, and the
phase roadmap.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Recharts ·
Prisma on Supabase (Postgres) · SheetJS (`xlsx`) · lucide-react.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure the database (Supabase / Postgres)
cp .env.example .env      # then fill in DATABASE_URL + DIRECT_URL from Supabase
npm run db:generate       # generate the Prisma client
npm run db:migrate        # create + apply the initial migration
npm run db:seed           # seed properties + BKDS June 2026 demo period
npm run db:verify         # sanity-check: prints a derived example

# 3. Run the dev server
npm run dev               # http://localhost:3000
```

Get `DATABASE_URL` (Transaction pooler, port 6543, `?pgbouncer=true`) and
`DIRECT_URL` (Session pooler, port 5432) from **Supabase → Project Settings →
Database → Connection string**. See `.env.example` for the exact formats.

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

Supabase Postgres for all environments. Prisma uses two URLs: `DATABASE_URL`
(transaction pooler, runtime) and `DIRECT_URL` (session/direct, migrations). See
`CLAUDE.md` for details. Apply all migrations with `npx prisma migrate deploy`.

## Auth & roles

Auth.js (NextAuth) with email/password + optional Google SSO. Roles: **ADMIN**
(full access, mark final, manage users), **EDITOR** (import + edit assigned
properties), **VIEWER** (read-only + export). Protection turns on when
`AUTH_SECRET` is set — until then the app stays open. Manage users in
**Admin → Users**; see the activity trail in **Admin → Activity**.

## Deployment

Production target is **Vercel** + Supabase/Neon Postgres. Full step-by-step
(env vars, migrations, auth, storage, PDF caveat, QA checklist) in
[`DEPLOY.md`](./DEPLOY.md).
