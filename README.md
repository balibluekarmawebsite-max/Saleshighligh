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
| `npm run format`     | Prettier                             |
| `npm run db:generate`| Generate the Prisma client           |
| `npm run db:migrate` | Create + apply a versioned migration |
| `npm run db:studio`  | Open Prisma Studio                   |

## Database

Supabase Postgres for all environments. Prisma uses two URLs: `DATABASE_URL`
(transaction pooler, runtime) and `DIRECT_URL` (session/direct, migrations). See
`CLAUDE.md` for details.
