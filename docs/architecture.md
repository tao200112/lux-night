# Lux Night Architecture

Lux Night is a pnpm monorepo for a self-hostable nightlife and event ticketing platform. It separates customer, merchant/staff, and admin workflows into distinct Next.js applications while sharing common auth, data, Supabase, QR, and security utilities.

## Monorepo Structure

```text
apps/
  customer-web/   Customer event discovery, checkout, wallet, tickets, and account flows
  internal-web/   Merchant and staff operations, ticket scanning, invites, and requests
  admin-web/      Platform administration, approvals, merchants, customers, orders, and settings
packages/
  shared/         Shared types, auth helpers, Supabase clients, data helpers, QR utilities
  security/       Security helpers such as rate limiting
supabase/
  migrations/     Postgres schema, RLS, RPC, and operational migrations
  scripts/        Database setup and maintenance utilities
docs/             Architecture, setup, audit, and operational notes
```

The root `package.json` defines workspace-level scripts for running, linting, building, and managing Supabase.

## Customer App

`apps/customer-web` is the public-facing application. It includes:

- Event and drop discovery.
- Event detail pages and ticket selection.
- Stripe checkout session creation.
- Auth callback and session routes.
- Customer wallet, orders, ticket detail, and profile pages.
- Public ticket and redemption routes.
- Stripe webhook processing for payment-driven fulfillment.

The customer app is usually the public domain for a self-hosted installation and is the app that receives Stripe webhook callbacks at `/api/stripe/webhook`.

## Merchant and Staff App

`apps/internal-web` is the venue operations app. It includes:

- Merchant dashboard and event management.
- Staff management.
- Invite creation and redemption flows.
- Ticket scanning, duplicate scan handling, wrong-venue handling, offline state, and manual lookup.
- Workspace and venue selection.
- Change request workflows for event updates.

This app should be deployed behind normal authentication and role checks. Staff routes should only expose the minimum data needed for door operations.

## Admin App

`apps/admin-web` is the platform administration app. It includes:

- Admin dashboard and operational overview.
- Merchant, customer, order, invite, ambassador, approval, and export views.
- Region and settings management.
- Event publishing and template/schedule controls.
- Server routes that use service-role access for admin-only operations.

Admin deployment should be restricted to trusted operators. Use `ADMIN_EMAIL_ALLOWLIST` and review admin authorization before production use.

## Shared Package

`packages/shared` contains reusable application code:

- Supabase browser and server clients.
- Auth guards such as user, admin, merchant role, and venue access helpers.
- Shared types and constants.
- Data helpers for profile, regions, drops, and internal workflows.
- QR and timezone utilities.
- RPC helper wrappers.

Shared code should remain framework-compatible with the apps that import it and should not include application-specific secrets.

## Security Package

`packages/security` contains reusable security primitives, currently including rate limiting helpers. Rate limiting can run with local fallbacks and can use Upstash Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured.

Security helpers should be used around high-risk routes such as checkout, invite validation, ticket redemption, auth-sensitive routes, and debug endpoints.

## Supabase

Supabase provides:

- Authentication.
- Postgres data storage.
- Row Level Security policies.
- RPC functions for operations that need database-side consistency.
- Migrations under `supabase/migrations`.
- Local development configuration under `supabase/config.toml`.

The anon key is public and must be constrained by RLS. The service-role key bypasses RLS and must only be used in trusted server-side routes after explicit authorization checks.

## Stripe

Stripe is used for:

- Checkout session creation.
- Payment completion.
- Payment expiration.
- Refund handling.
- Ticket and order fulfillment through webhook events.

Stripe secrets must remain server-only. The publishable key may be used in the browser.

## Webhook Flow

The expected checkout and fulfillment flow is:

1. A customer selects tickets in `customer-web`.
2. A server route validates event, ticket type, availability, invite state if applicable, and pricing.
3. The server creates a Stripe Checkout session with the configured `STRIPE_SECRET_KEY`.
4. Stripe redirects the customer after checkout.
5. Stripe sends events to `/api/stripe/webhook`.
6. The webhook route verifies the `stripe-signature` header using `STRIPE_WEBHOOK_SECRET`.
7. The webhook handler records or checks event processing state to avoid duplicate fulfillment.
8. Orders, tickets, sold counts, and invite usage are updated through Supabase with service-role access.
9. The customer can view issued tickets and venue staff can redeem them through scan/manual flows.

Webhook handlers must be idempotent because Stripe retries events and network failures can interrupt processing.
