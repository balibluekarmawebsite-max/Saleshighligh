# BK Sales Dashboard

Internal sales analytics dashboard and automated monthly report export for
**Blue Karma Group** (Bali hospitality). Replaces a manual ~60-slide monthly
"Sales Highlight" PowerPoint with an interactive dashboard.

See [`CLAUDE.md`](./CLAUDE.md) for full business context, conventions, and the
phase roadmap.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Recharts ·
Prisma (SQLite for dev, Postgres-ready) · SheetJS (`xlsx`) · lucide-react.

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Set up the local database
cp .env.example .env      # DATABASE_URL defaults to SQLite (file:./dev.db)
npm run db:generate       # generate the Prisma client
npm run db:push           # create the local SQLite database

# 3. Run the dev server
npm run dev               # http://localhost:3000
```

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
| `npm run db:push`    | Push the schema to the local DB      |
| `npm run db:studio`  | Open Prisma Studio                   |

## Production database

The Prisma schema is Postgres-compatible. To deploy on Postgres, change the
`datasource` provider in `prisma/schema.prisma` to `postgresql` and set
`DATABASE_URL` accordingly — no model changes required.
