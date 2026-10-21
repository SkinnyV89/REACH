# REACH
REACH is an AI-powered marketing and customer-acquisition platform for side hustlers, independent sellers, resellers, service providers and small businesses.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 3 · Prisma 7 with the `pg` adapter · Neon PostgreSQL · Better Auth (email + password, argon2id hashing) · Vitest.

## Local setup

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill in the values below
npm run db:migrate          # applies prisma/migrations to DATABASE_URL
npm run dev                 # http://localhost:3000
```

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string with `sslmode=require`. |
| `BETTER_AUTH_SECRET` | yes | 32+ random characters (`openssl rand -base64 32`). The app refuses to start in production without it. |
| `BETTER_AUTH_URL` | yes | Public base URL, e.g. `http://localhost:3000`. |
| `AUTH_RATE_LIMIT` | no | Set to `on` to enforce sign-in/sign-up rate limits in development (always on in production). |

Prisma 7 reads its connection URL from `prisma.config.ts` (which loads `.env`), not from `schema.prisma`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server. |
| `npm run build` / `npm start` | Production build and server. Building needs no secrets. |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks. |
| `npm test` | Unit tests. Integration tests are skipped unless `TEST_DATABASE_URL` is set. |
| `npm run db:migrate` | Apply committed migrations (`prisma migrate deploy`). |
| `npm run db:migrate:dev` | Create a new migration after editing the schema (development only). |

### Integration tests

`TEST_DATABASE_URL=postgresql://... npm test` runs the real auth handler against that database. Point it at a **disposable, migrated** database, never production. It deletes only the users it creates (`@reach-test.invalid` emails).

## Access control

Every protected page, server action and route handler must start with one of the helpers in `src/lib/session.ts`:

- `requireSession()`: redirects to `/sign-in` when signed out.
- `requireSeller()`: returns the signed-in user's own seller record. Scope every seller-owned query by `seller.id`, and never use a user or seller id sent from the browser.

## Status

| Area | State |
| --- | --- |
| Sign-up, sign-in, sign-out, protected dashboard | Implemented and tested |
| Email verification, password reset | Planned: needs an email provider |
| Seller onboarding (business profile) | Planned: Phase 2.2 |
