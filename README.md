# Lux Night

Lux Night is an early-stage, self-hostable nightlife and event ticketing platform for venues, clubs, promoters, and small event operators.

The project combines a customer ticket-buying experience, a merchant/staff operations portal, and an admin console in one TypeScript monorepo. It is designed for teams that need practical event discovery, checkout, invite codes, ticket issuance, and door redemption workflows without depending on a closed proprietary platform.

## Problem

Small nightlife operators often stitch together ticket sales, guest lists, payments, QR codes, staff permissions, and reporting across several tools. That creates operational risk at the door, makes refunds and invite tracking difficult, and leaves venues with limited control over their own data.

Lux Night aims to provide a transparent, hackable foundation for:

- Publishing nightlife events and recurring ticket drops.
- Selling tickets through Stripe Checkout.
- Issuing QR-backed tickets and public redemption links.
- Giving venue staff limited tools for scanning and manual lookup.
- Giving operators and admins visibility into orders, customers, merchants, events, and approvals.
- Running the whole stack against a Supabase project that the operator controls.

## Key Features

- Customer web app for discovery, checkout, wallet, orders, profile, and ticket redemption.
- Merchant and staff app for dashboards, event management, staff management, invite flows, ticket scan, manual lookup, and request workflows.
- Admin app for merchant management, approvals, customers, orders, exports, regions, invites, event controls, and operational settings.
- Supabase Auth, Postgres, RLS-aware data access, migrations, and service-role-only server operations.
- Stripe Checkout integration and webhook processing for order and ticket fulfillment.
- QR utilities and ticket redemption flows for venue door staff.
- Shared packages for auth helpers, data utilities, Supabase clients, QR helpers, and rate limiting.
- Monorepo structure that can be deployed as separate web apps.

## Architecture Overview

Lux Night is a pnpm workspace with three Next.js applications and two internal packages:

- `apps/customer-web`: public customer experience for event browsing, checkout, tickets, wallet, and account pages.
- `apps/internal-web`: merchant and staff-facing experience for venue operations, scanning, invites, and event requests.
- `apps/admin-web`: platform administration experience for operators who manage merchants, regions, approvals, customers, and reporting.
- `packages/shared`: shared types, Supabase clients, auth guards, data helpers, timezone helpers, and QR utilities.
- `packages/security`: reusable security helpers, including rate limiting primitives.
- `supabase`: database migrations, SQL utilities, local Supabase configuration, and maintenance scripts.

For a deeper system walkthrough, see [docs/architecture.md](docs/architecture.md).

## Apps

| App | Path | Default port | Purpose |
| --- | --- | ---: | --- |
| `customer-web` | `apps/customer-web` | `3000` | Customer-facing event discovery, Stripe checkout, ticket wallet, profile, and redemption links. |
| `internal-web` | `apps/internal-web` | `3001` | Merchant and staff portal for venue operations, ticket scanning, invite redemption, staff management, and event/change requests. |
| `admin-web` | `apps/admin-web` | `3002` | Admin console for platform operators: merchants, customers, orders, approvals, regions, invites, exports, and settings. |

## Tech Stack

- TypeScript
- Next.js App Router
- React
- pnpm workspaces
- Turbo
- Supabase Auth and Postgres
- Supabase Row Level Security policies and server-side service-role operations
- Stripe Checkout and Stripe webhooks
- Tailwind CSS
- Zod
- Optional Upstash Redis-backed rate limiting

## Local Development

### Prerequisites

- Node.js 18 or newer
- pnpm 8 or newer
- Supabase CLI for local database development
- Stripe CLI for local webhook testing

### Install

```bash
pnpm install
```

### Configure Environment

Copy the example environment file and fill in local or hosted values:

```bash
cp .env.example .env.local
```

Each app may also use its own `.env.local` depending on your deployment setup. Keep server-only secrets out of client-side code and never commit real secrets.

### Run Apps

```bash
pnpm dev:customer
pnpm dev:internal
pnpm dev:admin
```

The customer app runs on `http://localhost:3000`, the internal app on `http://localhost:3001`, and the admin app on `http://localhost:3002`.

### Build and Lint

```bash
pnpm lint
pnpm build
```

## Environment Variables

| Variable | Required | Scope | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Recommended | Client/server | Public base URL used for ticket, QR, invite, and redirect links. Use `http://localhost:3000` locally. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Client/server | Supabase project URL. Public by design. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Client/server | Supabase anon key. Public by design, but must be protected by RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes for server mutations/admin flows | Server only | Bypasses RLS. Never expose to the browser or commit it. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Required for checkout UI | Client/server | Stripe publishable key. |
| `STRIPE_SECRET_KEY` | Required for checkout/webhooks | Server only | Stripe secret key. Never expose to the browser. |
| `STRIPE_WEBHOOK_SECRET` | Required for webhooks | Server only | Stripe endpoint signing secret. |
| `ADMIN_EMAIL_ALLOWLIST` | Recommended | Server only | Comma-separated list of admin emails for admin-only paths. |
| `NEXT_PUBLIC_INTERNAL_BYPASS_EMAILS` | Optional | Client/server | Development-oriented internal access bypass list. Avoid relying on this in production. |
| `GOOGLE_MAPS_API_KEY` | Optional | Server only | Used by admin place autocomplete/details routes when enabled. |
| `UPSTASH_REDIS_REST_URL` | Optional | Server only | Enables Redis-backed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Server only | Token for Upstash Redis REST API. |
| `RATE_LIMIT_PREFIX` | Optional | Server only | Prefix for rate limit keys. |
| `REDEEM_EARLY_MINUTES` | Optional | Server only | Ticket redemption grace period before event validity starts. Defaults vary by route. |
| `REDEEM_LATE_MINUTES` | Optional | Server only | Ticket redemption grace period after event validity ends. Defaults vary by route. |
| `ADMIN_DEBUG_KEY` | Optional | Server only | Development/debug route guard. Do not enable broadly in production. |

## Supabase Setup

1. Create a Supabase project or start the local Supabase stack:

   ```bash
   pnpm supabase:start
   ```

2. Apply migrations from `supabase/migrations`.

   ```bash
   pnpm supabase:reset
   ```

   For a hosted project, link and push migrations:

   ```bash
   pnpm supabase:link <project-ref>
   pnpm supabase:push
   ```

3. Copy the Supabase URL, anon key, and service-role key into your environment files.

4. Review RLS policies before production use. The anon key is public; RLS and server-side authorization checks are the actual enforcement layer.

Additional self-hosting notes are in [docs/self-hosting.md](docs/self-hosting.md).

## Stripe Checkout and Webhooks

Lux Night uses Stripe for checkout and webhook-driven fulfillment.

1. Create a Stripe account and collect:
   - publishable key
   - secret key
   - webhook signing secret

2. Set:

   ```bash
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

3. For local webhook testing, forward Stripe events to the customer webhook route:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

4. In production, configure the Stripe webhook endpoint to:

   ```text
   https://your-customer-domain.example/api/stripe/webhook
   ```

5. Verify that checkout completion, payment success, expiration, refund, order updates, ticket issuance, and invite usage are idempotent in your deployment.

## Security Notes

Lux Night handles payments, tickets, invite codes, staff access, and customer data. Treat it as security-sensitive software.

- Never commit `.env.local`, service-role keys, Stripe secrets, webhook secrets, or debug keys.
- Keep `SUPABASE_SERVICE_ROLE_KEY` on the server only.
- Keep Supabase RLS enabled and review policies before deployment.
- Verify Stripe webhook signatures using `STRIPE_WEBHOOK_SECRET`.
- Make webhook handlers idempotent and safe to retry.
- Rate limit checkout, invite validation, ticket redemption, auth-sensitive, and debug endpoints.
- Ensure ticket redemption checks venue, validity window, redemption status, and duplicate scans.
- Rotate secrets after local demos, shared testing, or suspected exposure.

For reporting vulnerabilities, see [SECURITY.md](SECURITY.md).

## Roadmap

Lux Night is early-stage and actively evolving. Near-term areas of work include:

- Stronger automated tests for checkout, webhooks, invite usage, and ticket redemption.
- Production-ready observability and audit trails.
- Hardened admin and merchant role management.
- Better seed data and one-command local onboarding.
- Expanded documentation for RLS policies and deployment options.
- More complete CI coverage across apps and packages.
- Accessibility and responsive UX improvements across operational workflows.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request.

Good first contribution areas include documentation, setup improvements, test coverage, security hardening, and small UI polish that preserves existing workflows.

## License

Lux Night is released under the MIT License. See [LICENSE](LICENSE).
