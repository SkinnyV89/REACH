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
| `ANTHROPIC_API_KEY` | no | Claude API key for campaign generation. Server-side only. Without it, generation creates template copy labelled "Template, not AI-written". |
| `AI_MODEL` | no | Override the Claude model (default `claude-opus-5-5`). |
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
- `requireSeller()`: returns the signed-in user's own seller record, and sends users who haven't finished onboarding to `/onboarding`. Scope every seller-owned query by `seller.id`, and never use a user or seller id sent from the browser.

## Campaign engine

- **Master campaigns** are generated per category by `generateMasterCampaign()` (`src/lib/campaigns.ts`), called from the admin-only server action `generateMasterCampaignAction` or the operator command below. The prompt lives in `src/lib/prompts/master-campaign.ts`; the provider boundary is `src/lib/ai.ts`.
- Every AI response must match a structured schema **and** pass `validateMasterCopy()` (`src/lib/campaign-rules.ts`): length limits, the `{{business_name}}`/`{{location}}` placeholder rules, and a ban on prices, percentages, "free", guarantees, superlatives, health/income claims, reviews, links, phone numbers and handles. One retry is made with the broken rules; otherwise nothing is published.
- Every request is logged in `ai_jobs` (status, model, attempts, tokens, failure reason; never prompts or personal data).
- **Seller campaigns** are created when a seller clicks *Personalise*: placeholders are filled from the seller's profile, and any featured product's name and price come from the products table, never from the AI. Each gets a share path `/c/<seller-slug>-<8-char random code>`. The public page behind it is Phase 3.

### Making yourself an admin

There is no admin screen yet. Promote your own account directly in the database:

```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
```

### Generating a master campaign

```bash
npm run campaign:generate                                   # lists category slugs
npm run campaign:generate -- hair-wigs-weaves --as you@example.com
```

Each AI generation costs roughly one or two Claude requests. Without `ANTHROPIC_API_KEY` the command creates template copy instead.

## Categories

Seller categories live in the `categories` table, seeded by the `seller_onboarding` migration. They are data, not code: rename, reorder (`sort_order`) or hide one (`is_active = false`) without a deploy. A category in use by sellers cannot be deleted; deactivate it instead.

## Status

| Area | State |
| --- | --- |
| Sign-up, sign-in, sign-out, protected dashboard | Implemented and tested |
| Email verification, password reset | Planned: needs an email provider |
| Seller onboarding: 3-step wizard, categories, public slug | Implemented and tested |
| Products & services: add, edit, archive/restore, rand pricing | Implemented and tested |
| Logo and product photo upload | Planned: needs file storage (e.g. Vercel Blob or S3) |
| Product variants (sizes, colours) | Planned |
| Campaign engine: AI master campaigns, validation, template fallback | Implemented and tested with the AI provider mocked; live Claude calls not yet verified |
| Campaign library, personalisation, share links | Implemented and tested |
| Admin screen for generating campaigns | Planned (server action and CLI exist) |
| Seller editing of personalised copy | Planned |
| Public seller page `/seller/<slug>` and campaign page `/c/<link>` | Planned: Phase 3 (addresses are reserved) |
