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
| `BLOB_READ_WRITE_TOKEN` | for photos | Vercel Blob token (a **public** store). Server-side only. Without it, photo uploads are switched off and the upload buttons say so. |
| `UPLOADS_DRIVER` | no | `local` stores photos on local disk in `.uploads-dev/` (development and automated tests only; `next dev` uses it automatically when there's no Blob token). Never used on Vercel. |
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

## Public campaign pages and leads

- **`/c/<link>`** renders a seller's campaign publicly, but only after the seller presses **Publish**. Drafts and paused campaigns show "This campaign isn't available right now"; the owner sees a preview instead. Pages send `noindex, nofollow` so sellers' WhatsApp numbers stay out of search engines.
- Only public fields leave the server (`toPublicView` in `src/lib/public-campaigns.ts`). The featured product's name and price come from the products table; archived products are hidden.
- **Chat on WhatsApp** opens `wa.me` with a pre-typed greeting. It doesn't send anything by itself.
- **Enquiry form** (name, phone, optional message, required consent) creates a `Lead` for the campaign's seller. The seller is resolved on the server from the campaign; the request can't choose it. Abuse protection: a honeypot field, 5 enquiries per connection per campaign and 30 per connection overall every 10 minutes (IP addresses are HMAC-hashed), and the same number on the same campaign within 24 hours isn't saved twice.
- **Attribution:** `?src=whatsapp|facebook|instagram|tiktok` on a share link is recorded as the lead's channel; anything else is `UNKNOWN`, never guessed. The raw value is kept as `utm_source`.
- **Anonymous tracking:** `/api/track` records page views and WhatsApp taps for published campaigns, identified only by a random first-party `reach_vid` cookie (httpOnly, 180 days). Repeat views within 30 minutes aren't counted, and owners' own visits are never counted.
- **`/leads`** lists the seller's own leads with status tabs, call and WhatsApp buttons, source campaign and channel. Status changes match on lead id **and** seller id, and are audited.
- **`/privacy`** is a plain-language notice, marked *Draft, pending legal review*.

### Deleting leads (POPIA requests)

- Sellers delete a lead from `/leads` (two-step confirm). The delete matches on lead id **and** seller id, and the audit log records only the lead id and who deleted it.
- Requests emailed to REACH are handled with the operator command, which deletes that number's leads across all sellers:

```bash
npm run lead:delete -- "082 123 4567"            # dry run: shows what would be deleted
npm run lead:delete -- "082 123 4567" --confirm  # deletes permanently (audited as lead.deleted_on_request)
```

## Analytics

`/analytics` (`src/lib/analytics.ts`) reports only what REACH measured: page views and WhatsApp taps from `attribution_events`, and enquiries from `leads`. "Converted" counts leads the seller marked Converted. Periods: last 7, 30 (default) or 90 days, or all time.

- **Funnel:** views, taps and enquiries, with taps and enquiries each shown as a share of views (they're separate actions, not nested steps). A rate with nothing to divide by shows "—", never 0%.
- **Channels:** enquiries per channel as a bar chart, with a table of views, taps, enquiries and enquiries per view. Every channel is listed, even at zero; "Unknown" is shown in grey and always last.
- **Campaigns:** each seller campaign with its master campaign, sorted by enquiries. Shown as cards on phones and a table on wider screens.
- **Highlights:** plain statements from the numbers (top channel, untagged enquiries, best campaign), only when there's data behind them. No predictions or advice.
- Deleted leads are no longer counted.

## Storefronts

Every seller has a public storefront at **`/s/<slug>`**, with an item page per listing at **`/s/<slug>/<item-slug>`**.

- **Publishing is opt-in.** A storefront is public only when the seller is active **and** has pressed *Publish* on `/storefront`, which needs a town or city, at least one listing and a WhatsApp number. Unpublishing hides it (and its items and WhatsApp link) immediately; the owner can always preview.
- **Indexable, without exposing numbers.** Published storefronts and items can be indexed by search engines. The seller's WhatsApp number is never written into the page: *Chat on WhatsApp* goes through `/go/wa/<slug>` (`nofollow`, `noindex`, disallowed in `robots.txt`), which redirects to `wa.me` with a greeting naming the item.
- **Places** come from GeoNames (CC BY 4.0, credited in the public footer): all 341 South African towns and cities with population ≥ 1000, seeded by the `storefronts` migration. Sellers choose a town and may add a neighbourhood ("Pimville, Soweto"); it's never a street address. Finer suburb data needs the full GeoNames file, which this build environment couldn't download (`download.geonames.org` is blocked by its network policy); adding it later is an additive migration.
- **Layouts:** portfolio (services), product grid, or menu (food), suggested from the seller's categories and changeable.
- **Availability:** In stock, Pre-order, Made to order, Out of stock, or By booking (services), always shown with "updated N days ago" and an optional lead time. Out-of-stock items are listed last; archived items are hidden.
- **Readable item slugs** are generated from the name. Renaming an item gives it a new slug and keeps the old one as a permanent redirect, so shared links don't break.
- **Enquiries** from storefronts and items use the same pipeline as campaign pages (consent, honeypot, hashed-IP rate limits, 24-hour duplicate guard) and are tagged `STOREFRONT` or `PRODUCT`, with the product linked. `/leads` shows where each came from.
- **Campaign links** for new campaigns open the storefront with `?c=<code>`: a published campaign shows as a banner and its visits and enquiries are credited to it. Older campaigns keep their `/c/<link>` page, which still works.
- **Tracking:** storefront and item views are counted anonymously via `/api/track`; WhatsApp taps are counted server-side by `/go/wa`, only for browsers that loaded the page (they carry the `reach_vid` cookie) and never for the owner.

## Photos

Sellers add a **logo** and a **cover photo** on `/storefront`, and **up to six photos per item** on the item's edit page (new items open there straight after saving). Photos appear on the storefront (cover, logo, each listing's main photo), the item page (a swipeable gallery) and in link previews (`og:image`).

- **Upload path:** the browser shrinks each photo to at most 2048px and re-draws it as JPEG (PNG for logos) so it stays under 4 MB, below Vercel's 4.5 MB request limit, and posts it to `/api/uploads`, one photo per request. That route takes the seller from the session, checks they own the item, and rate-limits uploads to 60 per seller per hour.
- **Privacy:** every image is re-encoded on the server with sharp (`src/lib/images.ts`) before anything is stored: turned upright, all metadata removed (GPS, camera, timestamps), saved as WebP in a large (1600px) and a small (480px, covers 800px) size; logos are one 256px square. The original file is never stored. The file's real format is checked from its contents (JPEG, PNG or WebP only; never SVG), and images over 40 megapixels are refused before decoding.
- **Consent:** cover and item photos need the seller to confirm they have permission from anyone shown; the time is stored on the photo (`media.people_consent_at`). Logos don't ask.
- **Storage** (`src/lib/storage.ts`): Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, with paths like `media/<photo id>/lg.webp` (no seller id in public URLs). Local disk is for development only. Files are stored first and the database rows after; if saving the rows fails, the files are deleted. Replaced and removed photos are deleted from storage.
- **Limits in the database:** `product_media` allows positions 0 to 5 only, each used once per item, so an item can never hold more than six photos even with uploads arriving at once. Position 0 is the main photo; sellers reorder with *Make main* and the arrows.
- **Ready for video:** every `media` row has a `media_type`, `IMAGE` for everything today. `VIDEO` is reserved for short clips in Proof Posts (Step 2), where `url` will hold the video and `thumb_url` its poster image; the database keeps logos and covers as images. Video upload itself isn't built yet.
- `products.media` (JSON) and `sellers.logo_url` are unused, superseded by these tables, and will be dropped in a later cleanup.

## Categories

Seller categories live in the `categories` table, seeded by the `seller_onboarding` migration. They are data, not code: rename, reorder (`sort_order`) or hide one (`is_active = false`) without a deploy. A category in use by sellers cannot be deleted; deactivate it instead.

## Status

| Area | State |
| --- | --- |
| Sign-up, sign-in, sign-out, protected dashboard | Implemented and tested |
| Email verification, password reset | Planned: needs an email provider |
| Seller onboarding: 3-step wizard, categories, public slug | Implemented and tested |
| Products & services: add, edit, archive/restore, rand pricing | Implemented and tested |
| Logo, cover photo and item photo upload (Vercel Blob), GPS/metadata stripping | Implemented and tested with local-disk storage; a live Vercel Blob upload is still to be verified |
| Product variants (sizes, colours) | Planned |
| Campaign engine: AI master campaigns, validation, template fallback | Implemented and tested with the AI provider mocked; live Claude calls not yet verified |
| Campaign library, personalisation, share links | Implemented and tested |
| Admin screen for generating campaigns | Planned (server action and CLI exist) |
| Seller editing of personalised copy | Planned |
| Public campaign page `/c/<link>`, publish/pause, WhatsApp click-to-chat | Implemented and tested |
| Lead capture, `/leads` management, channel attribution, view/tap counts | Implemented and tested |
| Privacy notice | Draft, pending legal review |
| Lead deletion (seller UI and operator command) | Implemented and tested |
| Analytics: funnel, channel breakdown, campaign comparison | Implemented and tested |
| Dark mode | Not implemented anywhere in the app yet |
| New-lead notifications (email/SMS) | Planned: needs a provider |
| Public storefronts `/s/<slug>` and item pages, publish/unpublish, availability, WhatsApp redirect | Implemented and tested (Step 1a) |
| Storefront photos, logos and cover images | Implemented and tested (Step 1b) |
| Suburb-level places | Planned: needs `download.geonames.org` allowed in the build environment |
